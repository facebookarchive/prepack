/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { Realm } from "../realm.js";
import { ResidualHeapSerializer } from "./ResidualHeapSerializer.js";
import { canHoistReactElement } from "../react/hoisting.js";
import * as t from "@babel/types";
import type { BabelNode, BabelNodeExpression } from "@babel/types";
import { AbstractValue, AbstractObjectValue, ObjectValue, SymbolValue, FunctionValue, Value } from "../values/index.js";
import { convertExpressionToJSXIdentifier, convertKeyValueToJSXAttribute } from "../react/jsx.js";
import { Logger } from "../utils/logger.js";
import invariant from "../invariant.js";
import { FatalError } from "../errors.js";
import { traverseReactElement } from "../react/elements.js";
import { canExcludeReactElementObjectProperty, getReactSymbol, getProperty } from "../react/utils.js";
import type { ReactOutputTypes } from "../options.js";
import type { LazilyHoistedNodes } from "./types.js";
import type { ResidualOptimizedFunctions } from "./ResidualOptimizedFunctions";

type ReactElementAttributeType = "SPREAD" | "PROPERTY" | "PENDING";
type ReactElementChildType = "NORMAL" | "PENDING";

type ReactElementChild = {
  expr: void | BabelNodeExpression,
  type: ReactElementChildType,
};

type ReactElementAttribute = {
  expr: void | BabelNodeExpression,
  key: void | string,
  type: ReactElementAttributeType,
};

type ReactElement = {
  attributes: Array<ReactElementAttribute>,
  children: Array<ReactElementChild>,
  declared: boolean,
  type: void | BabelNodeExpression,
  value: ObjectValue,
};

export class ResidualReactElementSerializer {
  constructor(
    realm: Realm,
    residualHeapSerializer: ResidualHeapSerializer,
    residualOptimizedFunctions: ResidualOptimizedFunctions
  ) {
    this.realm = realm;
    this.residualHeapSerializer = residualHeapSerializer;
    this.logger = residualHeapSerializer.logger;
    this.reactOutput = realm.react.output || "create-element";
    this._lazilyHoistedNodes = new Map();
    this._residualOptimizedFunctions = residualOptimizedFunctions;
  }

  realm: Realm;
  logger: Logger;
  reactOutput: ReactOutputTypes;
  residualHeapSerializer: ResidualHeapSerializer;
  _lazilyHoistedNodes: Map<FunctionValue, LazilyHoistedNodes>;
  _residualOptimizedFunctions: ResidualOptimizedFunctions;

  _createReactElement(value: ObjectValue): ReactElement {
    return { attributes: [], children: [], declared: false, type: undefined, value };
  }

  _createReactElementAttribute(): ReactElementAttribute {
    return { expr: undefined, key: undefined, type: "PENDING" };
  }

  _createReactElementChild(): ReactElementChild {
    return { expr: undefined, type: "PENDING" };
  }

  _emitHoistedReactElement(
    reactElement: ObjectValue,
    id: BabelNodeExpression,
    reactElementAst: BabelNodeExpression,
    hoistedCreateElementIdentifier: BabelNodeIdentifier,
    originalCreateElementIdentifier: BabelNodeIdentifier
  ): void {
    // if the currentHoistedReactElements is not defined, we create it an emit the function call
    // this should only occur once per additional function
    const optimizedFunction = this._residualOptimizedFunctions.tryGetOptimizedFunctionRoot(reactElement);
    invariant(optimizedFunction);
    let lazilyHoistedNodes = this._lazilyHoistedNodes.get(optimizedFunction);
    if (lazilyHoistedNodes === undefined) {
      let funcId = t.identifier(this.residualHeapSerializer.functionNameGenerator.generate());
      lazilyHoistedNodes = {
        id: funcId,
        createElementIdentifier: hoistedCreateElementIdentifier,
        nodes: [],
      };
      this._lazilyHoistedNodes.set(optimizedFunction, lazilyHoistedNodes);
      let statement = t.expressionStatement(
        t.logicalExpression(
          "&&",
          t.binaryExpression("===", id, t.unaryExpression("void", t.numericLiteral(0), true)),
          // pass the createElementIdentifier if it's not null
          t.callExpression(funcId, originalCreateElementIdentifier ? [originalCreateElementIdentifier] : [])
        )
      );
      this.residualHeapSerializer.getPrelude(optimizedFunction).push(statement);
    }
    // we then push the reactElement and its id into our list of elements to process after
    // the current additional function has serialzied
    lazilyHoistedNodes.nodes.push({ id, astNode: reactElementAst });
  }

  _getReactLibraryValue(): AbstractObjectValue | ObjectValue {
    let reactLibraryObject = this.realm.fbLibraries.react;
    // if there is no React library, then we should throw and error
    if (reactLibraryObject === undefined) {
      throw new FatalError("unable to find React library reference in scope");
    }
    return reactLibraryObject;
  }

  _getReactCreateElementValue(): Value {
    let reactLibraryObject = this._getReactLibraryValue();
    return getProperty(this.realm, reactLibraryObject, "createElement");
  }

  _emitReactElement(reactElement: ReactElement): BabelNodeExpression {
    let { value } = reactElement;
    let typeValue = getProperty(this.realm, value, "type");
    let keyValue = getProperty(this.realm, value, "key");
    let refValue = getProperty(this.realm, value, "ref");
    let propsValue = getProperty(this.realm, value, "props");

    let shouldHoist =
      this._residualOptimizedFunctions.tryGetOptimizedFunctionRoot(value) !== undefined &&
      canHoistReactElement(this.realm, value);

    let id = this.residualHeapSerializer.getSerializeObjectIdentifier(value);
    // this identifier is used as the deafult, but also passed to the hoisted factory function
    let originalCreateElementIdentifier = null;
    // this name is used when hoisting, and is passed into the factory function, rather than the original
    let hoistedCreateElementIdentifier = null;
    let reactElementAstNode;
    let dependencies = [typeValue, keyValue, refValue, propsValue, value];
    let createElement;

    if (this.reactOutput === "create-element") {
      createElement = this._getReactCreateElementValue();
      dependencies.push(createElement);
    }

    this.residualHeapSerializer.emitter.emitNowOrAfterWaitingForDependencies(
      dependencies,
      () => {
        if (this.reactOutput === "jsx") {
          reactElementAstNode = this._serializeReactElementToJSXElement(value, reactElement);
        } else if (this.reactOutput === "create-element") {
          originalCreateElementIdentifier = this.residualHeapSerializer.serializeValue(createElement);

          if (shouldHoist) {
            const optimizedFunction = this._residualOptimizedFunctions.tryGetOptimizedFunctionRoot(value);
            invariant(optimizedFunction);
            const lazilyHoistedNodes = this._lazilyHoistedNodes.get(optimizedFunction);
            // if we haven't created a lazilyHoistedNodes before, then this is the first time
            // so we only create the hoisted identifier once
            if (lazilyHoistedNodes === undefined) {
              // create a new unique instance
              hoistedCreateElementIdentifier = t.identifier(
                this.residualHeapSerializer.intrinsicNameGenerator.generate()
              );
            } else {
              hoistedCreateElementIdentifier = lazilyHoistedNodes.createElementIdentifier;
            }
          }

          let createElementIdentifier = shouldHoist ? hoistedCreateElementIdentifier : originalCreateElementIdentifier;
          reactElementAstNode = this._serializeReactElementToCreateElement(
            value,
            reactElement,
            createElementIdentifier
          );
        } else {
          invariant(false, "Unknown reactOutput specified");
        }
        // if we are hoisting this React element, put the assignment in the body
        // also ensure we are in an additional function
        if (shouldHoist) {
          this._emitHoistedReactElement(
            value,
            id,
            reactElementAstNode,
            hoistedCreateElementIdentifier,
            originalCreateElementIdentifier
          );
        } else {
          // Note: it can be expected that we assign to the same variable multiple times
          // this is due to fact ReactElements are immutable objects and the fact that
          // when we inline/fold logic, the same ReactElements are referenced at different
          // points with different attributes. Given we can't mutate an immutable object,
          // we instead create new objects and assign to the same binding
          if (reactElement.declared) {
            this.residualHeapSerializer.emitter.emit(
              t.expressionStatement(t.assignmentExpression("=", id, reactElementAstNode))
            );
          } else {
            reactElement.declared = true;
            this.residualHeapSerializer.emitter.emit(
              t.variableDeclaration("var", [t.variableDeclarator(id, reactElementAstNode)])
            );
          }
        }
      },
      this.residualHeapSerializer.emitter.getBody()
    );
    return id;
  }

  _serializeNowOrAfterWaitingForDependencies(
    value: Value,
    reactElement: ReactElement,
    func: () => void | BabelNode,
    shouldSerialize?: boolean = true
  ): void {
    let reason = this.residualHeapSerializer.emitter.getReasonToWaitForDependencies(value);

    const serialize = () => {
      func();
    };

    if (reason) {
      this.residualHeapSerializer.emitter.emitAfterWaiting(
        reason,
        [value],
        () => {
          serialize();
          this._emitReactElement(reactElement);
        },
        this.residualHeapSerializer.emitter.getBody()
      );
    } else {
      serialize();
    }
  }

  _serializeReactFragmentType(typeValue: SymbolValue): BabelNodeExpression {
    let reactLibraryObject = this._getReactLibraryValue();
    return t.memberExpression(this.residualHeapSerializer.serializeValue(reactLibraryObject), t.identifier("Fragment"));
  }

  serializeReactElement(val: ObjectValue): BabelNodeExpression {
    let reactElementData = this.realm.react.reactElements.get(val);
    invariant(reactElementData !== undefined);
    let { firstRenderOnly } = reactElementData;
    let reactElement = this._createReactElement(val);

    traverseReactElement(this.realm, reactElement.value, {
      visitType: (typeValue: Value) => {
        this._serializeNowOrAfterWaitingForDependencies(typeValue, reactElement, () => {
          let expr;

          if (typeValue instanceof SymbolValue && typeValue === getReactSymbol("react.fragment", this.realm)) {
            expr = this._serializeReactFragmentType(typeValue);
          } else {
            expr = this.residualHeapSerializer.serializeValue(typeValue);
            // Increment ref count one more time to ensure that this object will be assigned a unique id.
            // Abstract values that are emitted as first argument to JSX elements needs a proper id.
            this.residualHeapSerializer.residualHeapValueIdentifiers.incrementReferenceCount(typeValue);
          }
          reactElement.type = expr;
        });
      },
      visitKey: (keyValue: Value) => {
        let reactElementKey = this._createReactElementAttribute();
        this._serializeNowOrAfterWaitingForDependencies(keyValue, reactElement, () => {
          let expr = this.residualHeapSerializer.serializeValue(keyValue);
          reactElementKey.expr = expr;
          reactElementKey.key = "key";
          reactElementKey.type = "PROPERTY";
        });
        reactElement.attributes.push(reactElementKey);
      },
      visitRef: (refValue: Value) => {
        if (!firstRenderOnly) {
          let reactElementRef = this._createReactElementAttribute();
          this._serializeNowOrAfterWaitingForDependencies(refValue, reactElement, () => {
            let expr = this.residualHeapSerializer.serializeValue(refValue);
            reactElementRef.expr = expr;
            reactElementRef.key = "ref";
            reactElementRef.type = "PROPERTY";
          });
          reactElement.attributes.push(reactElementRef);
        }
      },
      visitAbstractOrPartialProps: (propsValue: AbstractValue | ObjectValue) => {
        let reactElementSpread = this._createReactElementAttribute();
        this._serializeNowOrAfterWaitingForDependencies(propsValue, reactElement, () => {
          let expr = this.residualHeapSerializer.serializeValue(propsValue);
          reactElementSpread.expr = expr;
          reactElementSpread.type = "SPREAD";
        });
        reactElement.attributes.push(reactElementSpread);
      },
      visitConcreteProps: (propsValue: ObjectValue) => {
        for (let [propName, binding] of propsValue.properties) {
          if (binding.descriptor === undefined || propName === "children") {
            continue;
          }
          let propValue = getProperty(this.realm, propsValue, propName);
          if (canExcludeReactElementObjectProperty(this.realm, val, propName, propValue)) {
            continue;
          }
          let reactElementAttribute = this._createReactElementAttribute();

          this._serializeNowOrAfterWaitingForDependencies(propValue, reactElement, () => {
            let expr = this.residualHeapSerializer.serializeValue(propValue);
            reactElementAttribute.expr = expr;
            reactElementAttribute.key = propName;
            reactElementAttribute.type = "PROPERTY";
          });
          reactElement.attributes.push(reactElementAttribute);
        }
      },
      visitChildNode: (childValue: Value) => {
        reactElement.children.push(this._serializeReactElementChild(childValue, reactElement));
      },
    });
    return this._emitReactElement(reactElement);
  }

  _addSerializedValueToJSXAttriutes(prop: string | null, expr: any, attributes: Array<BabelNode>): void {
    if (prop === null) {
      attributes.push(t.jSXSpreadAttribute(expr));
    } else {
      attributes.push(convertKeyValueToJSXAttribute(prop, expr));
    }
  }

  _serializeReactElementToCreateElement(
    val: ObjectValue,
    reactElement: ReactElement,
    createElementIdentifier: BabelNodeIdentifier
  ): BabelNodeExpression {
    let { type, attributes, children } = reactElement;

    let createElementArguments = [type];
    // check if we need to add attributes
    if (attributes.length !== 0) {
      let astAttributes = [];
      for (let attribute of attributes) {
        let expr = ((attribute.expr: any): BabelNodeExpression);

        if (attribute.type === "SPREAD") {
          astAttributes.push(t.spreadElement(expr));
        } else if (attribute.type === "PROPERTY") {
          let attributeKey = attribute.key;
          let key;

          invariant(typeof attributeKey === "string");
          if (attributeKey.includes("-")) {
            key = t.stringLiteral(attributeKey);
          } else {
            key = t.identifier(attributeKey);
          }
          astAttributes.push(t.objectProperty(key, expr));
        }
      }
      createElementArguments.push(t.objectExpression(astAttributes));
    }
    if (children.length !== 0) {
      if (attributes.length === 0) {
        createElementArguments.push(t.nullLiteral());
      }
      let astChildren = [];
      for (let child of children) {
        let expr = ((child.expr: any): BabelNodeExpression);

        if (child.type === "NORMAL") {
          astChildren.push(expr);
        }
      }
      createElementArguments.push(...astChildren);
    }
    // cast to any for createElementArguments as casting it to BabelNodeExpresion[] isn't working
    let createElementCall = t.callExpression(createElementIdentifier, (createElementArguments: any));
    this._addBailOutMessageToBabelNode(val, createElementCall);
    return createElementCall;
  }

  _serializeReactElementToJSXElement(val: ObjectValue, reactElement: ReactElement): BabelNodeExpression {
    let { type, attributes, children } = reactElement;

    let jsxTypeIdentifer = convertExpressionToJSXIdentifier(((type: any): BabelNodeIdentifier), true);
    let astAttributes = [];
    for (let attribute of attributes) {
      let expr = ((attribute.expr: any): BabelNodeExpression);

      if (attribute.type === "SPREAD") {
        astAttributes.push(t.jSXSpreadAttribute(expr));
      } else if (attribute.type === "PROPERTY") {
        let attributeKey = attribute.key;
        invariant(typeof attributeKey === "string");
        astAttributes.push(convertKeyValueToJSXAttribute(attributeKey, expr));
      }
    }

    let astChildren = [];
    for (let child of children) {
      let expr = ((child.expr: any): BabelNodeExpression);

      if (child.type === "NORMAL") {
        if (t.isStringLiteral(expr) || t.isNumericLiteral(expr)) {
          astChildren.push(t.jSXText(((expr: any).value: string) + ""));
        } else if (t.isJSXElement(expr)) {
          astChildren.push(expr);
        } else {
          astChildren.push(t.jSXExpressionContainer(expr));
        }
      }
    }

    let openingElement = t.jSXOpeningElement(jsxTypeIdentifer, (astAttributes: any), astChildren.length === 0);
    let closingElement = t.jSXClosingElement(jsxTypeIdentifer);
    let jsxElement = t.jSXElement(openingElement, closingElement, astChildren, astChildren.length === 0);
    this._addBailOutMessageToBabelNode(val, jsxElement);
    return jsxElement;
  }

  _addBailOutMessageToBabelNode(val: ObjectValue, node: BabelNode): void {
    // if there has been a bail-out, we create an inline BlockComment node before the JSX element
    if (val.$BailOutReason !== undefined) {
      // $BailOutReason contains an optional string of what to print out in the comment
      node.leadingComments = [({ type: "BlockComment", value: `${val.$BailOutReason}` }: any)];
    }
  }

  _serializeReactElementChild(child: Value, reactElement: ReactElement): ReactElementChild {
    let reactElementChild = this._createReactElementChild();
    this._serializeNowOrAfterWaitingForDependencies(child, reactElement, () => {
      let expr = this.residualHeapSerializer.serializeValue(child);

      reactElementChild.expr = expr;
      reactElementChild.type = "NORMAL";
    });
    return reactElementChild;
  }

  serializeLazyHoistedNodes(optimizedFunction: FunctionValue): Array<BabelNodeStatement> {
    const entries = [];
    const lazilyHoistedNodes = this._lazilyHoistedNodes.get(optimizedFunction);
    if (lazilyHoistedNodes !== undefined) {
      let { id, nodes, createElementIdentifier } = lazilyHoistedNodes;
      // create a function that initializes all the hoisted nodes
      let func = t.functionExpression(
        null,
        // use createElementIdentifier if it's not null
        createElementIdentifier ? [createElementIdentifier] : [],
        t.blockStatement(nodes.map(node => t.expressionStatement(t.assignmentExpression("=", node.id, node.astNode))))
      );
      // push it to the mainBody of the module
      entries.push(t.variableDeclaration("var", [t.variableDeclarator(id, func)]));
      // output all the empty variable declarations that will hold the nodes lazily
      entries.push(...nodes.map(node => t.variableDeclaration("var", [t.variableDeclarator(node.id)])));
      // reset the _lazilyHoistedNodes so other additional functions work
      this._lazilyHoistedNodes.delete(optimizedFunction);
    }
    return entries;
  }
}
