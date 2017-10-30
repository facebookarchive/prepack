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
import { Realm } from "../realm.js";
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
import { IsAccessorDescriptor } from "../methods/index.js";
import { isReactComponent, getUniqueReactElementKey } from "./utils";

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
        isRoot === false || isReactComponent(name),
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
          addKeyToElement((astElement: any), getUniqueReactElementKey("" + i, usedReactElementKeys));
        } else if (t.isArrayExpression(astElement)) {
          applyKeysToNestedArray((astElement: any), false, usedReactElementKeys);
        } else if (astElement.type === "ConditionalExpression") {
          let alternate = (astElement.alternate: any);
          // it's common for conditions to be in an array, which means we need to check them for keys too
          if (t.isJSXElement(alternate.type) && isBase === false) {
            addKeyToElement(alternate, getUniqueReactElementKey("0" + i, usedReactElementKeys));
          } else if (t.isArrayExpression(alternate.type)) {
            applyKeysToNestedArray(alternate, false, usedReactElementKeys);
          }
          let consequent = (astElement.consequent: any);
          if (t.isJSXElement(consequent.type) && isBase === false) {
            addKeyToElement(consequent, getUniqueReactElementKey("1" + i, usedReactElementKeys));
          } else if (t.isArrayExpression(consequent.type)) {
            applyKeysToNestedArray(consequent, false, usedReactElementKeys);
          }
        }
      }
    }
  }
}

export function getJSXPropertyValue(realm: Realm, properties: Map<string, any>, key: string) {
  if (properties.has(key)) {
    let val = properties.get(key);

    if (val !== undefined) {
      let descriptor = val.descriptor;
      invariant(!IsAccessorDescriptor(realm, descriptor), "expected descriptor to be a non-accessor property");

      if (descriptor !== undefined) {
        let descriptorValue = descriptor.value;

        if (descriptorValue !== undefined) {
          return descriptorValue;
        }
      }
    }
  }
  return null;
}
