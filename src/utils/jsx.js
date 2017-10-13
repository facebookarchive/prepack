/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import * as t from "babel-types";
import type {
  BabelNodeExpression,
  BabelNodeArrayExpression,
  BabelNodeJSXElement,
  BabelNodeJSXMemberExpression,
  BabelNodeJSXIdentifier,
  BabelNodeIdentifier,
  BabelNodeMemberExpression,
} from "babel-types";
import invariant from "../invariant.js";
import { Value, ObjectValue, SymbolValue } from "../values/index.js";
import { Get } from "../methods/index.js";

export function isReactElement(val: Value): boolean {
  if (val instanceof ObjectValue && val.properties.has("$$typeof")) {
    let realm = val.$Realm;
    let $$typeof = Get(realm, val, "$$typeof");
    if ($$typeof instanceof SymbolValue) {
      let symbolFromRegistry = realm.globalSymbolRegistry.find(e => e.$Symbol === $$typeof);
      return symbolFromRegistry !== undefined && symbolFromRegistry.$Key === "react.element";
    }
  }
  return false;
}

export function convertExpressionToJSXIdentifier(
  expr: BabelNodeExpression,
  isRoot: boolean
): BabelNodeJSXMemberExpression | BabelNodeJSXIdentifier {
  switch (expr.type) {
    case "ThisExpression":
      invariant(isRoot === false, `invalid conversion of root expression to JSXIdentifier for ThisExpression`);
      return t.jSXIdentifier("this");
    case "Identifier":
      let name = expr.name;
      invariant(
        // ensure the 1st character of the string is uppercase
        // for a component unless it is not the root
        isRoot === false || (name.length > 0 && name[0] === name[0].toUpperCase()),
        "invalid JSXIdentifer from Identifier, Identifier name must be uppercase"
      );
      return t.jSXIdentifier(name);
    case "StringLiteral":
      let value = expr.value;
      invariant(
        // ensure the 1st character of the string is lowercase
        // otherwise it will appear as a component
        value.length > 0 && value[0] === value[0].toLowerCase(),
        "invalid JSXIdentifer from string, strings must be lowercase"
      );
      return t.jSXIdentifier(value);
    case "MemberExpression":
      invariant(expr.computed === false, "Cannot inline computed expressions in JSX type.");
      return t.jSXMemberExpression(
        convertExpressionToJSXIdentifier(expr.object, false),
        ((convertExpressionToJSXIdentifier(expr.property, false): any): BabelNodeJSXIdentifier)
      );
    default:
      invariant(false, "Invalid JSX type");
  }
}

export function convertJSXExpressionToIdentifier(
  expr: BabelNodeExpression
): BabelNodeMemberExpression | BabelNodeIdentifier {
  switch (expr.type) {
    case "JSXIdentifier":
      return t.identifier(expr.name);
    case "JSXMemberExpression":
      return t.memberExpression(
        convertJSXExpressionToIdentifier(expr.object),
        (convertJSXExpressionToIdentifier(expr.property): any)
      );
    default:
      invariant(false, "Invalid JSX type");
  }
}

export function convertKeyValueToJSXAttribute(key: string, expr: BabelNodeExpression) {
  return t.jSXAttribute(t.jSXIdentifier(key), expr.type === "StringLiteral" ? expr : t.jSXExpressionContainer(expr));
}

function addKeyToElement(astElement: BabelNodeJSXElement, key) {
  let astAttributes = astElement.openingElement.attributes;
  let existingKey = null;

  for (let i = 0; i < astAttributes.length; i++) {
    let astAttribute = astAttributes[i];

    if (t.isJSXAttribute(astAttribute) && t.isJSXIdentifier(astAttribute.name) && astAttribute.name.name === "key") {
      existingKey = astAttribute.value;
      break;
    }
  }
  if (existingKey === null) {
    astAttributes.push(t.jSXAttribute(t.jSXIdentifier("key"), t.stringLiteral(key)));
  }
}

// we create a unique key for each JSXElement to prevent collisions
// otherwise React will detect a missing/conflicting key at runtime and
// this can break the reconcilation of JSXElements in arrays
function getUniqueJSXElementKey(index?: string, usedReactElementKeys: Set<string>) {
  let key;
  do {
    key = Math.random().toString(36).replace(/[^a-z]+/g, "").substring(0, 2);
  } while (usedReactElementKeys.has(key));
  usedReactElementKeys.add(key);
  if (index !== undefined) {
    return `${key}${index}`;
  }
  return key;
}

export function applyKeysToNestedArray(
  expr: BabelNodeArrayExpression,
  isBase: boolean,
  usedReactElementKeys: Set<string>
): void {
  let astElements = expr.elements;

  if (Array.isArray(astElements)) {
    for (let i = 0; i < astElements.length; i++) {
      let astElement = astElements[i];

      if (astElement != null) {
        if (t.isJSXElement(astElement) && isBase === false) {
          addKeyToElement((astElement: any), getUniqueJSXElementKey("" + i, usedReactElementKeys));
        } else if (t.isArrayExpression(astElement)) {
          applyKeysToNestedArray((astElement: any), false, usedReactElementKeys);
        } else if (astElement.type === "ConditionalExpression") {
          let alternate = (astElement.alternate: any);
          // it's common for conditions to be in an array, which means we need to check them for keys too
          if (t.isJSXElement(alternate.type) && isBase === false) {
            addKeyToElement(alternate, getUniqueJSXElementKey("0" + i, usedReactElementKeys));
          } else if (t.isArrayExpression(alternate.type)) {
            applyKeysToNestedArray(alternate, false, usedReactElementKeys);
          }
          let consequent = (astElement.consequent: any);
          if (t.isJSXElement(consequent.type) && isBase === false) {
            addKeyToElement(consequent, getUniqueJSXElementKey("1" + i, usedReactElementKeys));
          } else if (t.isArrayExpression(consequent.type)) {
            applyKeysToNestedArray(consequent, false, usedReactElementKeys);
          }
        }
      }
    }
  }
}
