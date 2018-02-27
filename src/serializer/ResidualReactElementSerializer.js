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
import * as t from "babel-types";
import type { BabelNode, BabelNodeExpression } from "babel-types";
import {
  ArrayValue,
  NumberValue,
  Value,
  ObjectValue,
  StringValue,
  SymbolValue,
  AbstractValue,
} from "../values/index.js";
import { convertExpressionToJSXIdentifier, convertKeyValueToJSXAttribute } from "../react/jsx.js";
import { Logger } from "../utils/logger.js";
import invariant from "../invariant.js";
import { FatalError } from "../errors";
import { getReactSymbol, getProperty } from "../react/utils.js";
import type { ReactOutputTypes } from "../options.js";
import type { LazilyHoistedNodes } from "./types.js";

export class ResidualReactElementSerializer {
  constructor(realm: Realm, residualHeapSerializer: ResidualHeapSerializer) {
    this.realm = realm;
    this.residualHeapSerializer = residualHeapSerializer;
    this.logger = residualHeapSerializer.logger;
    this.reactOutput = realm.react.output || "create-element";
    this._lazilyHoistedNodes = undefined;
  }

  realm: Realm;
  logger: Logger;
  reactOutput: ReactOutputTypes;
  residualHeapSerializer: ResidualHeapSerializer;
  _lazilyHoistedNodes: void | LazilyHoistedNodes;

  serializeReactElement(val: ObjectValue): BabelNodeExpression {
    let typeValue = getProperty(this.realm, val, "type");
    let keyValue = getProperty(this.realm, val, "key");
    let refValue = getProperty(this.realm, val, "ref");
    let propsValue = getProperty(this.realm, val, "props");
    let waitForProperties = [val, typeValue, keyValue, refValue, propsValue];

    let attributes = [];
    let children = [];

    if (keyValue !== this.realm.intrinsics.null) {
      let keyExpr = this.residualHeapSerializer.serializeValue(keyValue);
      if (this.reactOutput === "jsx") {
        this._addSerializedValueToJSXAttriutes("key", keyExpr, attributes);
      } else if (this.reactOutput === "create-element") {
        this._addSerializedValueToObjectProperty("key", keyExpr, attributes);
      }
    }

    if (refValue !== this.realm.intrinsics.null) {
      let refExpr = this.residualHeapSerializer.serializeValue(refValue);
      if (this.reactOutput === "jsx") {
        this._addSerializedValueToJSXAttriutes("ref", refExpr, attributes);
      } else if (this.reactOutput === "create-element") {
        this._addSerializedValueToObjectProperty("ref", refExpr, attributes);
      }
    }

    const assignPropsAsASpreadProp = () => {
      if (this.reactOutput === "jsx") {
        this._addSerializedValueToJSXAttriutes(
          null,
          this.residualHeapSerializer.serializeValue(propsValue),
          attributes
        );
      } else if (this.reactOutput === "create-element") {
        this._addSerializedValueToObjectProperty(
          null,
          this.residualHeapSerializer.serializeValue(propsValue),
          attributes
        );
      }
    };

    // handle props
    if (propsValue instanceof AbstractValue) {
      assignPropsAsASpreadProp();
    } else if (propsValue instanceof ObjectValue) {
      if (propsValue.isPartialObject()) {
        assignPropsAsASpreadProp();
      } else {
        this.residualHeapSerializer.serializedValues.add(propsValue);
        for (let [propName, binding] of propsValue.properties) {
          if (binding.descriptor !== undefined && propName !== "children") {
            invariant(propName !== "key" && propName !== "ref", `"${propName}" is a reserved prop name`);
            let value = getProperty(this.realm, propsValue, propName);
            let serializedValue = this._serializeValue(value, waitForProperties);

            if (this.reactOutput === "jsx") {
              this._addSerializedValueToJSXAttriutes(propName, serializedValue, attributes);
            } else if (this.reactOutput === "create-element") {
              this._addSerializedValueToObjectProperty(propName, serializedValue, attributes);
            }
          }
        }
      }
      // handle children
      if (propsValue.properties.has("children")) {
        let childrenValue = getProperty(this.realm, propsValue, "children");
        this.residualHeapSerializer.serializedValues.add(childrenValue);

        if (childrenValue !== this.realm.intrinsics.undefined && childrenValue !== this.realm.intrinsics.null) {
          if (childrenValue instanceof ArrayValue) {
            let childrenLength = getProperty(this.realm, childrenValue, "length");
            let childrenLengthValue = 0;
            if (childrenLength instanceof NumberValue) {
              childrenLengthValue = childrenLength.value;
              for (let i = 0; i < childrenLengthValue; i++) {
                let child = getProperty(this.realm, childrenValue, "" + i);
                if (child instanceof Value) {
                  children.push(this._serializeReactElementChild(child, waitForProperties));
                } else {
                  this.logger.logError(
                    val,
                    `ReactElement "props.children[${i}]" failed to serialize due to a non-value`
                  );
                }
              }
            }
          } else {
            children.push(this._serializeReactElementChild(childrenValue, waitForProperties));
          }
        }
      }
    }

    let reactLibraryObject = this.realm.fbLibraries.react;
    let shouldHoist =
      this.residualHeapSerializer.isReferencedOnlyByAdditionalFunction(val) !== undefined &&
      canHoistReactElement(this.realm, val);

    let id = this.residualHeapSerializer.getSerializeObjectIdentifier(val);
    // this identifier is used as the deafult, but also passed to the hoisted factory function
    let originalCreateElementIdentifier = null;
    // this name is used when hoisting, and is passed into the factory function, rather than the original
    let hoistedCreateElementIdentifier = null;
    let reactElement;

    if (this.reactOutput === "jsx") {
      reactElement = this._serializeReactElementToJSXElement(val, typeValue, attributes, children, reactLibraryObject);
    } else if (this.reactOutput === "create-element") {
      // if there is no React library, then we should throw and error, as it is needed for createElement output
      if (reactLibraryObject === undefined) {
        throw new FatalError("unable to serialize JSX to createElement due to React not being referenced in scope");
      }
      let createElement = getProperty(this.realm, reactLibraryObject, "createElement");
      originalCreateElementIdentifier = this.residualHeapSerializer.serializeValue(createElement);
      if (shouldHoist) {
        // if we haven't created a _lazilyHoistedNodes before, then this is the first time
        // so we only create the hoisted identifier once
        if (this._lazilyHoistedNodes === undefined) {
          // create a new unique instance
          hoistedCreateElementIdentifier = t.identifier(this.residualHeapSerializer.intrinsicNameGenerator.generate());
        } else {
          hoistedCreateElementIdentifier = this._lazilyHoistedNodes.createElementIdentifier;
        }
      }

      reactElement = this._serializeReactElementToCreateElement(
        val,
        typeValue,
        attributes,
        children,
        shouldHoist ? hoistedCreateElementIdentifier : originalCreateElementIdentifier,
        reactLibraryObject
      );
    } else {
      invariant(false, "Unknown reactOutput specified");
    }
    // if we are hoisting this React element, put the assignment in the body
    // also ensure we are in an additional function
    if (shouldHoist) {
      // if the currentHoistedReactElements is not defined, we create it an emit the function call
      // this should only occur once per additional function
      if (this._lazilyHoistedNodes === undefined) {
        let funcId = t.identifier(this.residualHeapSerializer.functionNameGenerator.generate());
        this._lazilyHoistedNodes = {
          id: funcId,
          createElementIdentifier: hoistedCreateElementIdentifier,
          nodes: [],
        };
        let statement = t.expressionStatement(
          t.logicalExpression(
            "&&",
            t.binaryExpression("===", id, t.unaryExpression("void", t.numericLiteral(0), true)),
            // pass the createElementIdentifier if it's not null
            t.callExpression(funcId, originalCreateElementIdentifier ? [originalCreateElementIdentifier] : [])
          )
        );
        this.residualHeapSerializer.emitter.emit(statement);
      }
      // we then push the reactElement and its id into our list of elements to process after
      // the current additional function has serialzied
      invariant(this._lazilyHoistedNodes !== undefined);
      invariant(Array.isArray(this._lazilyHoistedNodes.nodes));
      this._lazilyHoistedNodes.nodes.push({ id, astNode: reactElement });
    } else {
      let reason = this.residualHeapSerializer.emitter.getReasonToWaitForDependencies(val);
      let declar = t.variableDeclaration("var", [t.variableDeclarator(id, reactElement)]);

      if (!reason) {
        this.residualHeapSerializer.emitter.emit(declar);
      } else {
        this.residualHeapSerializer.emitter.emitAfterWaiting(reason, waitForProperties, () => {
          this.residualHeapSerializer.emitter.emit(declar);
        });

        return id;
      }
    }
    return reactElement;
  }

  _serializeValue(value: Value, waitForProperties: Array<Value>) {
    let serializedValue;
    let reason = this.residualHeapSerializer.emitter.getReasonToWaitForDependencies(value);

    if (reason) {
      waitForProperties.push(value);
      this.residualHeapSerializer.emitter.emitAfterWaiting(reason, [value], () => {
        this.residualHeapSerializer.serializeValue(value);
      });
      invariant(value instanceof AbstractValue);
      if (value.hasIdentifier()) {
        serializedValue = value.getIdentifier();
      } else {
        serializedValue = this.residualHeapSerializer.getSerializeObjectIdentifier(value);
      }
    } else {
      serializedValue = this.residualHeapSerializer.serializeValue(value);
    }
    return serializedValue;
  }

  _addSerializedValueToJSXAttriutes(prop: string | null, expr: any, attributes: Array<BabelNode>): void {
    if (prop === null) {
      attributes.push(t.jSXSpreadAttribute(expr));
    } else {
      attributes.push(convertKeyValueToJSXAttribute(prop, expr));
    }
  }

  _addSerializedValueToObjectProperty(prop: string | null, expr: any, attributes: Array<BabelNode>): void {
    if (prop === null) {
      attributes.push(t.spreadProperty(expr));
    } else {
      let key;

      if (prop.includes("-")) {
        key = t.stringLiteral(prop);
      } else {
        key = t.identifier(prop);
      }
      attributes.push(t.objectProperty(key, expr));
    }
  }

  _serializeReactFragmentType(typeValue: Value, reactLibraryObject: void | ObjectValue): BabelNodeExpression {
    // if there is no React library, then we should throw and error, as it is needed for React.Fragment output
    if (reactLibraryObject === undefined) {
      throw new FatalError("unable to serialize JSX fragment due to React not being referenced in scope");
    }
    // we want to vist the Symbol type, but we don't want to serialize it
    // as this is a React internal
    this.residualHeapSerializer.serializedValues.add(typeValue);
    invariant(typeValue.$Description instanceof StringValue);
    this.residualHeapSerializer.serializedValues.add(typeValue.$Description);
    return t.memberExpression(this.residualHeapSerializer.serializeValue(reactLibraryObject), t.identifier("Fragment"));
  }

  _serializeReactElementToCreateElement(
    val: ObjectValue,
    typeValue: Value,
    attributes: Array<BabelNode>,
    children: Array<BabelNode>,
    createElementIdentifier: BabelNodeIdentifier,
    reactLibraryObject: void | ObjectValue
  ): BabelNodeExpression {
    let typeIdentifier;
    if (typeValue instanceof SymbolValue && typeValue === getReactSymbol("react.fragment", this.realm)) {
      typeIdentifier = this._serializeReactFragmentType(typeValue, reactLibraryObject);
    } else {
      typeIdentifier = this.residualHeapSerializer.serializeValue(typeValue);
    }
    let createElementArguments = [typeIdentifier];
    // check if we need to add attributes
    if (attributes.length !== 0) {
      // cast to any for createElementArguments as casting it to BabelNodeObjectProperty[] isn't working
      createElementArguments.push(t.objectExpression((attributes: any)));
    }
    if (children.length !== 0) {
      if (attributes.length === 0) {
        createElementArguments.push(t.nullLiteral());
      }
      createElementArguments.push(...children);
    }
    // cast to any for createElementArguments as casting it to BabelNodeExpresion[] isn't working
    let createElementCall = t.callExpression(createElementIdentifier, (createElementArguments: any));
    this._addBailOutMessageToBabelNode(val, createElementCall);
    return createElementCall;
  }

  _serializeReactElementToJSXElement(
    val: ObjectValue,
    typeValue: Value,
    attributes: Array<BabelNode>,
    children: Array<BabelNode>,
    reactLibraryObject: void | ObjectValue
  ): BabelNodeExpression {
    if (reactLibraryObject !== undefined) {
      this.residualHeapSerializer.serializeValue(reactLibraryObject);
    }
    let typeIdentifier;
    if (typeValue instanceof SymbolValue && typeValue === getReactSymbol("react.fragment", this.realm)) {
      typeIdentifier = this._serializeReactFragmentType(typeValue, reactLibraryObject);
    } else {
      typeIdentifier = this.residualHeapSerializer.serializeValue(typeValue);
    }
    let jsxTypeIdentifer = convertExpressionToJSXIdentifier(typeIdentifier, true);
    let openingElement = t.jSXOpeningElement(jsxTypeIdentifer, (attributes: any), children.length === 0);
    let closingElement = t.jSXClosingElement(jsxTypeIdentifer);

    let jsxElement = t.jSXElement(openingElement, closingElement, children, children.length === 0);
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

  _serializeReactElementChild(child: Value, waitForProperties: Array<Value>): BabelNode {
    let expr = this._serializeValue(child, waitForProperties);

    if (this.reactOutput === "jsx") {
      if (t.isStringLiteral(expr) || t.isNumericLiteral(expr)) {
        return t.jSXText(((expr: any).value: string) + "");
      } else if (t.isJSXElement(expr)) {
        return expr;
      }
      return t.jSXExpressionContainer(expr);
    } else if (this.reactOutput === "create-element") {
      return expr;
    }
    invariant(false, "Unknown reactOutput specified");
  }

  serializeLazyHoistedNodes() {
    const entries = [];
    if (this._lazilyHoistedNodes !== undefined) {
      let { id, nodes, createElementIdentifier } = this._lazilyHoistedNodes;
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
      this._lazilyHoistedNodes = undefined;
    }
    return entries;
  }
}
