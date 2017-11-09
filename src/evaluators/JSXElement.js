/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { Realm } from "../realm.js";
import type { LexicalEnvironment } from "../environment.js";
import { FatalError } from "../errors.js";
import type {
  BabelNode,
  BabelNodeStringLiteral,
  BabelNodeJSXText,
  BabelNodeJSXElement,
  BabelNodeJSXIdentifier,
  BabelNodeJSXMemberExpression,
  BabelNodeJSXAttribute,
  BabelNodeJSXSpreadAttribute,
  BabelNodeJSXExpressionContainer,
} from "babel-types";
import { ArrayValue, StringValue, Value, NumberValue, ObjectValue, SymbolValue } from "../values/index.js";
import { convertJSXExpressionToIdentifier } from "../react/jsx";
import * as t from "babel-types";
import {
  Get,
  GetValue,
  ResolveBinding,
  ArrayCreate,
  CreateDataPropertyOrThrow,
  ObjectCreate,
} from "../methods/index.js";
import { Properties } from "../singletons.js";
import invariant from "../invariant.js";
import { computeBinary } from "./BinaryExpression.js";

let RESERVED_PROPS = {
  key: true,
  ref: true,
  __self: true,
  __source: true,
};

let reactElementSymbolKey = "react.element";

// taken from Babel
function cleanJSXElementLiteralChild(child: string): null | string {
  let lines = child.split(/\r\n|\n|\r/);

  let lastNonEmptyLine = 0;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/[^ \t]/)) {
      lastNonEmptyLine = i;
    }
  }

  let str = "";

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    let isFirstLine = i === 0;
    let isLastLine = i === lines.length - 1;
    let isLastNonEmptyLine = i === lastNonEmptyLine;

    // replace rendered whitespace tabs with spaces
    let trimmedLine = line.replace(/\t/g, " ");

    // trim whitespace touching a newline
    if (!isFirstLine) {
      trimmedLine = trimmedLine.replace(/^[ ]+/, "");
    }

    // trim whitespace touching an endline
    if (!isLastLine) {
      trimmedLine = trimmedLine.replace(/[ ]+$/, "");
    }

    if (trimmedLine) {
      if (!isLastNonEmptyLine) {
        trimmedLine += " ";
      }

      str += trimmedLine;
    }
  }

  if (str) {
    return str;
  }
  return null;
}

function evaluateJSXMemberExpression(
  ast: BabelNode,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): Value {
  switch (ast.type) {
    case "JSXIdentifier":
      return GetValue(realm, ResolveBinding(realm, ((ast: any): BabelNodeJSXIdentifier).name, strictCode, env));
    case "JSXMemberExpression":
      return GetValue(
        realm,
        env.evaluate(convertJSXExpressionToIdentifier(((ast: any): BabelNodeJSXMemberExpression)), strictCode)
      );
    default:
      invariant(false, "Unknown JSX Identifier");
  }
}

function evaluateJSXIdentifier(ast, strictCode, env, realm): Value {
  if (isTagName(ast)) {
    // special cased lower-case and custom elements
    return new StringValue(realm, ((ast: any): BabelNodeJSXIdentifier).name);
  }
  return evaluateJSXMemberExpression(ast, strictCode, env, realm);
}

function evaluateJSXValue(value: BabelNode, strictCode: boolean, env: LexicalEnvironment, realm: Realm): Value {
  if (value != null) {
    switch (value.type) {
      case "JSXText":
        return new StringValue(realm, ((value: any): BabelNodeJSXText).value);
      case "StringLiteral":
        return new StringValue(realm, ((value: any): BabelNodeStringLiteral).value);
      case "JSXExpressionContainer":
        return GetValue(realm, env.evaluate(((value: any): BabelNodeJSXExpressionContainer).expression, strictCode));
      case "JSXElement":
        return GetValue(realm, env.evaluate(value, strictCode));
      default:
        invariant(false, `Unknown JSX value type: ${value.type}`);
    }
  }
  invariant(false, `Null or undefined value passed when trying to evaluate JSX node value`);
}

function isTagName(ast: BabelNode): boolean {
  return ast.type === "JSXIdentifier" && /^[a-z]|\-/.test(((ast: any): BabelNodeJSXIdentifier).name);
}

function getDefaultProps(
  elementType: BabelNodeJSXIdentifier | BabelNodeJSXMemberExpression,
  env,
  realm: Realm
): null | ObjectValue {
  let name;
  if (elementType.type === "JSXIdentifier") {
    name = elementType.name;
  }
  if (!isTagName(elementType) && typeof name === "string") {
    // find the value of "ComponentXXX.defaultProps"
    let defaultProps = GetValue(
      realm,
      env.evaluate(t.memberExpression(t.identifier(name), t.identifier("defaultProps")), false)
    );

    if (defaultProps instanceof ObjectValue) {
      return defaultProps;
    }
  }
  return null;
}

function evaluateJSXChildren(
  children: Array<BabelNode>,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): ArrayValue | Value | null {
  if (children.length === 0) {
    return null;
  }
  if (children.length === 1) {
    let singleChild = evaluateJSXValue(children[0], strictCode, env, realm);

    if (singleChild instanceof StringValue) {
      let text = cleanJSXElementLiteralChild(singleChild.value);
      if (text !== null) {
        singleChild.value = text;
      }
    }
    return singleChild;
  }
  let array = ArrayCreate(realm, 0);
  let dynamicChildrenLength = children.length;
  let dynamicIterator = 0;
  let lastChildValue = null;
  for (let i = 0; i < children.length; i++) {
    let value = evaluateJSXValue(children[i], strictCode, env, realm);
    if (value instanceof StringValue) {
      let text = cleanJSXElementLiteralChild(value.value);
      if (text === null) {
        dynamicChildrenLength--;
        // this is a space full of whitespace, so let's proceed
        continue;
      } else {
        value.value = text;
      }
    }
    lastChildValue = value;
    CreateDataPropertyOrThrow(realm, array, "" + dynamicIterator, value);
    dynamicIterator++;
  }
  if (dynamicChildrenLength === 1) {
    return lastChildValue;
  }

  Properties.Set(realm, array, "length", new NumberValue(realm, dynamicChildrenLength), false);
  return array;
}

function evaluateJSXAttributes(
  elementType: BabelNodeJSXIdentifier | BabelNodeJSXMemberExpression,
  astAttributes: Array<BabelNodeJSXAttribute | BabelNodeJSXSpreadAttribute>,
  astChildren: Array<BabelNode>,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): { attributes: Map<string, Value>, children: ArrayValue | Value | null } {
  let attributes = new Map();
  let children = evaluateJSXChildren(astChildren, strictCode, env, realm);
  let defaultProps = getDefaultProps(elementType, env, realm);

  // defaultProps are a bit like default function arguments
  // if an actual value exists, it should overwrite the default value
  if (defaultProps !== null) {
    for (let [key] of defaultProps.properties) {
      let defaultPropValue = Get(realm, defaultProps, key);

      if (defaultPropValue instanceof Value) {
        if (key === "children") {
          if (children === null) {
            children = defaultPropValue;
          }
        } else {
          attributes.set(key, defaultPropValue);
        }
      }
    }
  }
  for (let astAttribute of astAttributes) {
    switch (astAttribute.type) {
      case "JSXAttribute":
        let { name, value } = astAttribute;

        invariant(name.type === "JSXIdentifier", `JSX attribute name type not supported: ${astAttribute.type}`);
        attributes.set(name.name, evaluateJSXValue(((value: any): BabelNodeJSXIdentifier), strictCode, env, realm));
        break;
      case "JSXSpreadAttribute":
        let spreadValue = GetValue(realm, env.evaluate(astAttribute.argument, strictCode));

        if (spreadValue instanceof ObjectValue) {
          for (let [key, spreadProp] of spreadValue.properties) {
            if (spreadProp !== undefined && spreadProp.descriptor !== undefined) {
              let spreadPropValue = spreadProp.descriptor.value;

              if (spreadPropValue instanceof Value) {
                if (key === "children") {
                  children = spreadPropValue;
                } else {
                  attributes.set(key, spreadPropValue);
                }
              }
            }
          }
        } else {
          throw new FatalError("ObjectValues are the only supported value for JSX Spread Attributes");
        }
        break;
      default:
        invariant(false, `Unknown JSX attribute type:: ${astAttribute.type}`);
    }
  }
  return {
    attributes,
    children,
  };
}

function getReactElementSymbol(realm: Realm): SymbolValue {
  let reactElementSymbol = realm.react.reactElementSymbol;
  if (reactElementSymbol !== undefined) {
    return reactElementSymbol;
  }
  let SymbolFor = realm.intrinsics.Symbol.properties.get("for");
  if (SymbolFor !== undefined) {
    let SymbolForDescriptor = SymbolFor.descriptor;

    if (SymbolForDescriptor !== undefined) {
      let SymbolForValue = SymbolForDescriptor.value;
      if (SymbolForValue !== undefined && typeof SymbolForValue.$Call === "function") {
        realm.react.reactElementSymbol = reactElementSymbol = SymbolForValue.$Call(realm.intrinsics.Symbol, [
          new StringValue(realm, reactElementSymbolKey),
        ]);
      }
    }
  }
  invariant(reactElementSymbol instanceof SymbolValue, `ReactElement "$$typeof" property was not a symbol`);
  return reactElementSymbol;
}

function createReactProps(
  realm: Realm,
  type: Value,
  attributes: Map<string, Value>,
  children,
  env: LexicalEnvironment
): ObjectValue {
  let obj = ObjectCreate(realm, realm.intrinsics.ObjectPrototype);
  for (let [key, value] of attributes) {
    if (typeof key === "string") {
      if (RESERVED_PROPS.hasOwnProperty(key)) {
        continue;
      }
      CreateDataPropertyOrThrow(realm, obj, key, value);
    }
  }
  if (children !== null) {
    CreateDataPropertyOrThrow(realm, obj, "children", children);
  }
  return obj;
}

function createReactElement(realm: Realm, type: Value, key: Value, ref: Value, props: ObjectValue): ObjectValue {
  let obj = ObjectCreate(realm, realm.intrinsics.ObjectPrototype);
  CreateDataPropertyOrThrow(realm, obj, "$$typeof", getReactElementSymbol(realm));
  CreateDataPropertyOrThrow(realm, obj, "type", type);
  CreateDataPropertyOrThrow(realm, obj, "key", key);
  CreateDataPropertyOrThrow(realm, obj, "ref", ref);
  CreateDataPropertyOrThrow(realm, obj, "props", props);
  CreateDataPropertyOrThrow(realm, obj, "_owner", realm.intrinsics.null);
  return obj;
}

export default function(
  ast: BabelNodeJSXElement,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): ObjectValue {
  invariant(realm.react.enabled, "JSXElements can only be evaluated with the reactEnabled option");
  let openingElement = ast.openingElement;
  let type = evaluateJSXIdentifier(openingElement.name, strictCode, env, realm);
  let { attributes, children } = evaluateJSXAttributes(
    openingElement.name,
    openingElement.attributes,
    ast.children,
    strictCode,
    env,
    realm
  );
  let key = attributes.get("key") || realm.intrinsics.null;
  let ref = attributes.get("ref") || realm.intrinsics.null;

  if (key === realm.intrinsics.undefined) {
    key = realm.intrinsics.null;
  }
  if (ref === realm.intrinsics.undefined) {
    ref = realm.intrinsics.null;
  }

  // React uses keys to identify nodes as they get updated through the reconcilation
  // phase. Keys are used in a map and thus need to be converted to strings
  if (key !== realm.intrinsics.null) {
    key = computeBinary(realm, "+", realm.intrinsics.emptyString, key);
  }
  let props = createReactProps(realm, type, attributes, children, env);

  return createReactElement(realm, type, key, ref, props);
}
