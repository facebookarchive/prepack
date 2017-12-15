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
import { isReactElement } from "../react/utils.js";
import { Get, IsAccessorDescriptor } from "../methods/index.js";
import * as t from "babel-types";
import type { BabelNode, BabelNodeExpression } from "babel-types";
import { ArrayValue, NumberValue, Value, ObjectValue } from "../values/index.js";
import { convertExpressionToJSXIdentifier, convertKeyValueToJSXAttribute } from "../react/jsx.js";
import { Logger } from "./logger.js";
import invariant from "../invariant.js";
import { FatalError } from "../errors";
import type { ReactOutputTypes } from "../options.js";

export class ResidualReactElements {
  constructor(realm: Realm, residualHeapSerializer: ResidualHeapSerializer) {
    this.realm = realm;
    this.residualHeapSerializer = residualHeapSerializer;
    this.logger = residualHeapSerializer.logger;
    this.reactOutput = realm.react.output || "create-element";
  }

  realm: Realm;
  logger: Logger;
  reactOutput: ReactOutputTypes;
  residualHeapSerializer: ResidualHeapSerializer;

  serializeReactElement(val: ObjectValue): BabelNodeExpression {
    let typeValue = Get(this.realm, val, "type");
    let keyValue = Get(this.realm, val, "key");
    let refValue = Get(this.realm, val, "ref");
    let propsValue = Get(this.realm, val, "props");

    invariant(typeValue !== null, "ReactElement type of null");

    let attributes = [];
    let children = [];

    if (keyValue !== null) {
      let keyExpr = this.residualHeapSerializer.serializeValue(keyValue);
      if (keyExpr.type !== "NullLiteral") {
        if (this.reactOutput === "jsx") {
          this._addSerializedValueToJSXAttriutes("key", keyExpr, attributes);
        } else if (this.reactOutput === "create-element") {
          this._addSerializedValueToObjectProperty("key", keyExpr, attributes);
        }
      }
    }

    if (refValue !== null) {
      let refExpr = this.residualHeapSerializer.serializeValue(refValue);
      if (refExpr.type !== "NullLiteral") {
        if (this.reactOutput === "jsx") {
          this._addSerializedValueToJSXAttriutes("ref", refExpr, attributes);
        } else if (this.reactOutput === "create-element") {
          this._addSerializedValueToObjectProperty("ref", refExpr, attributes);
        }
      }
    }

    if (propsValue instanceof ObjectValue) {
      // the propsValue is visited to get the properties, but we don't emit it as the object
      this.residualHeapSerializer.serializedValues.add(propsValue);
      // have to case propsValue to ObjectValue or Flow complains that propsValues can be null/undefined
      for (let [key, propertyBinding] of (propsValue: ObjectValue).properties) {
        let desc = propertyBinding.descriptor;
        if (desc === undefined) continue; // deleted
        invariant(!IsAccessorDescriptor(this.realm, desc), "expected descriptor to be a non-accessor property");

        invariant(key !== "key" && key !== "ref", `"${key}" is a reserved prop name`);

        if (key === "children" && desc.value !== undefined) {
          let childrenValue = desc.value;
          if (childrenValue instanceof ArrayValue) {
            this.residualHeapSerializer.serializedValues.add(childrenValue);
            let childrenLength = Get(this.realm, childrenValue, "length");
            let childrenLengthValue = 0;
            if (childrenLength instanceof NumberValue) {
              childrenLengthValue = childrenLength.value;
              for (let i = 0; i < childrenLengthValue; i++) {
                let child = Get(this.realm, childrenValue, "" + i);
                if (child instanceof Value) {
                  children.push(this._serializeReactElementChild(child));
                } else {
                  this.logger.logError(
                    val,
                    `ReactElement "props.children[${i}]" failed to serialize due to a non-value`
                  );
                }
              }
              continue;
            }
          }
          // otherwise it must be a value, as desc.value !== undefined.
          children.push(this._serializeReactElementChild(((childrenValue: any): Value)));
          continue;
        }
        if (desc.value instanceof Value) {
          if (this.reactOutput === "jsx") {
            this._addSerializedValueToJSXAttriutes(
              key,
              this.residualHeapSerializer.serializeValue(desc.value),
              attributes
            );
          } else if (this.reactOutput === "create-element") {
            this._addSerializedValueToObjectProperty(
              key,
              this.residualHeapSerializer.serializeValue(desc.value),
              attributes
            );
          }
        }
      }
    }
    let reactLibraryObject = this.realm.react.reactLibraryObject;
    if (this.reactOutput === "jsx") {
      return this._serializeReactElementToJSXElement(val, typeValue, attributes, children, reactLibraryObject);
    } else if (this.reactOutput === "create-element") {
      return this._serializeReactElementToCreateElement(val, typeValue, attributes, children, reactLibraryObject);
    }
    invariant(false, "Unknown reactOutput specified");
  }

  _addSerializedValueToJSXAttriutes(prop: string, expr: any, attributes: Array<BabelNode>): void {
    attributes.push(convertKeyValueToJSXAttribute(prop, expr));
  }

  _addSerializedValueToObjectProperty(prop: string, expr: any, attributes: Array<BabelNode>): void {
    let key;

    if (prop.includes("-")) {
      key = t.stringLiteral(prop);
    } else {
      key = t.identifier(prop);
    }
    attributes.push(t.objectProperty(key, expr));
  }

  _serializeReactElementToCreateElement(
    val: ObjectValue,
    typeValue: Value,
    attributes: Array<BabelNode>,
    children: Array<BabelNode>,
    reactLibraryObject?: ObjectValue
  ): BabelNodeExpression {
    // if there is no React library, then we should throw and error, as it is needed for createElement output
    if (reactLibraryObject === undefined) {
      throw new FatalError("unable to serialize JSX to createElement due to React not being referenced in scope");
    }
    let createElement = Get(this.realm, reactLibraryObject, "createElement");
    let createElementIdentifier = this.residualHeapSerializer.serializeValue(createElement);
    let typeIdentifier = this.residualHeapSerializer.serializeValue(typeValue);
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
    reactLibraryObject?: ObjectValue
  ): BabelNodeExpression {
    if (reactLibraryObject !== undefined) {
      this.residualHeapSerializer.serializeValue(reactLibraryObject);
    }
    let identifier = convertExpressionToJSXIdentifier(this.residualHeapSerializer.serializeValue(typeValue), true);
    let openingElement = t.jSXOpeningElement(identifier, (attributes: any), children.length === 0);
    let closingElement = t.jSXClosingElement(identifier);

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

  _serializeReactElementChild(child: Value): BabelNode {
    if (isReactElement(child)) {
      // if we know it's a ReactElement, we add the value to the serializedValues
      // and short cut to get back the JSX expression so we don't emit additional data
      // we do this to ensure child JSXElements can get keys assigned if needed
      this.residualHeapSerializer.serializedValues.add(child);
      let reactChild = this.residualHeapSerializer.serializeValueObject(((child: any): ObjectValue));
      if (reactChild.leadingComments != null && this.reactOutput === "jsx") {
        return t.jSXExpressionContainer(reactChild);
      }
      return reactChild;
    }
    const expr = this.residualHeapSerializer.serializeValue(child);

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
}
