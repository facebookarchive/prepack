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
import type { Reference } from "../environment.js";
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
import { StringValue, ConcreteValue, Value, NumberValue, ObjectValue } from "../values/index.js";
import { convertJSXExpressionToIdentifier } from "../utils/jsx";
import {
  GetValue,
  ToString,
  ResolveBinding,
  ArrayCreate,
  CreateDataPropertyOrThrow,
  ObjectCreate,
  Set,
} from "../methods/index.js";
import invariant from "../invariant.js";

let RESERVED_PROPS = {
  key: true,
  ref: true,
  __self: true,
  __source: true,
};

let reactElementSymbol;
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

function evaluateJSXMemberExpression(ast: BabelNode, strictCode: boolean, env: LexicalEnvironment, realm: Realm) {
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

function evaluateJSXIdentifier(ast, strictCode, env, realm) {
  if (isTagName(ast)) {
    // special cased lower-case and custom elements
    return new StringValue(realm, ((ast: any): BabelNodeJSXIdentifier).name);
  }
  return evaluateJSXMemberExpression(ast, strictCode, env, realm);
}

function evaluateJSXValue(value: BabelNode, strictCode: boolean, env: LexicalEnvironment, realm: Realm) {
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

function isTagName(ast: BabelNode) {
  return ast.type === "JSXIdentifier" && /^[a-z]|\-/.test(((ast: any): BabelNodeJSXIdentifier).name);
}

function getDefaultProps(elementType: BabelNodeJSXIdentifier | BabelNodeJSXMemberExpression, realm: Realm) {
  let name;
  if (elementType.type === "JSXIdentifier") {
    name = elementType.name;
  }
  if (!isTagName(elementType) && typeof name === "string") {
    let componentsFromNames = realm.react.componentsFromNames;

    if (componentsFromNames.has(name)) {
      let component = componentsFromNames.get(name);
      if (component !== undefined) {
        return component.defaultPropsObjectExpression;
      }
    }
  }
  return null;
}

function evaluateJSXChildren(children: Array<BabelNode>, strictCode: boolean, env: LexicalEnvironment, realm: Realm) {
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

  Set(realm, array, "length", new NumberValue(realm, dynamicChildrenLength), false);
  return array;
}

function evaluateJSXAttributes(
  elementType: BabelNodeJSXIdentifier | BabelNodeJSXMemberExpression,
  astAttributes: Array<BabelNodeJSXAttribute | BabelNodeJSXSpreadAttribute>,
  astChildren: Array<BabelNode>,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
) {
  let attributes = new Map();
  let children = evaluateJSXChildren(astChildren, strictCode, env, realm);
  let defaultPropsObjectExpression = getDefaultProps(elementType, realm);

  if (defaultPropsObjectExpression !== null) {
    defaultPropsObjectExpression.properties.forEach(property => {
      let name;
      if (property.key.type === "Identifier") {
        name = property.key.name;
      }
      invariant(typeof name === "string", "Invalid JSX attribute key with non-string type");
      attributes.set(name, GetValue(realm, env.evaluate(property.value, strictCode)));
    });
  }
  for (let astAttribute of astAttributes) {
    switch (astAttribute.type) {
      case "JSXAttribute":
        let { name, value } = astAttribute;
        invariant(name.type === "JSXIdentifier", `JSX attribute name type not supported: ${astAttribute.type}`);
        attributes.set(name.name, evaluateJSXValue(((value: any): BabelNodeJSXIdentifier), strictCode, env, realm));
        break;
      case "JSXSpreadAttribute":
        // TODO
        return invariant(false, "TODO: JSX Spread Attibutes are not supported");
      default:
        invariant(false, `Unknown JSX attribute type:: ${astAttribute.type}`);
    }
  }
  return {
    attributes,
    children,
  };
}

function getReactElementSymbol(realm: Realm) {
  if (reactElementSymbol !== undefined) {
    return reactElementSymbol;
  }
  let SymbolFor = realm.intrinsics.Symbol.properties.get("for");
  if (SymbolFor !== undefined) {
    let SymbolForDescriptor = SymbolFor.descriptor;

    if (SymbolForDescriptor !== undefined) {
      let SymbolForValue = SymbolForDescriptor.value;
      if (SymbolForValue !== undefined && typeof SymbolForValue.$Call === "function") {
        reactElementSymbol = SymbolForValue.$Call(realm.intrinsics.Symbol, [
          new StringValue(realm, reactElementSymbolKey),
        ]);
      }
    }
  }
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

function createReactElement(realm: Realm, type: Value, key: Value, ref: Value, props: ObjectValue) {
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
): Value | Reference {
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

  if (key !== realm.intrinsics.null && key instanceof ConcreteValue) {
    key = new StringValue(realm, ToString(realm, key));
  }
  let props = createReactProps(realm, type, attributes, children, env);

  return createReactElement(realm, type, key, ref, props);
}
