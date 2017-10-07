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
} from "babel-types";
import invariant from "../invariant.js";

const usedKeys = new Set();

export function convertExpressionToJSXIdentifier(
  expr: BabelNodeExpression
): BabelNodeJSXMemberExpression | BabelNodeJSXIdentifier {
  switch (expr.type) {
    case "ThisExpression":
      return t.jSXIdentifier("this");
    case "Identifier":
      return t.jSXIdentifier(expr.name);
    case "StringLiteral":
      return t.jSXIdentifier(expr.value);
    case "MemberExpression":
      invariant(expr.computed === false, "Cannot inline computed expressions in JSX type.");
      return t.jSXMemberExpression(
        convertExpressionToJSXIdentifier(expr.object),
        (convertExpressionToJSXIdentifier(expr.property): any)
      );
    case "ArrowFunctionExpression":
      return (expr: any);
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

    if (
      t.isJSXAttribute(astAttribute.type) &&
      t.isJSXIdentifier(astAttribute.name.type) &&
      astAttribute.name.name === "key"
    ) {
      existingKey = astAttribute.value;
    }
  }
  if (existingKey !== null) {
    // do nothing for now
  } else {
    astAttributes.push(t.jSXAttribute(t.jSXIdentifier("key"), t.stringLiteral(key)));
  }
}

// we create a unique key for each JSXElement to prevent collisions
// otherwise React will detect a missing/conflicting key at runtime and
// this can break the reconcilation of JSXElements in arrays
function getUniqueJSXElementKey(index?: string) {
  let key;
  do {
    key = Math.random().toString(36).replace(/[^a-z]+/g, "").substring(0, 2);
  } while (!usedKeys.has(key));
  usedKeys.add(key);
  if (index !== undefined) {
    return `${key}${index}`;
  }
  return key;
}

export function applyKeysToNestedArray(expr: BabelNodeArrayExpression, isBase: boolean): void {
  let astElements = expr.elements;

  if (Array.isArray(astElements)) {
    for (let i = 0; i < astElements.length; i++) {
      let astElement = astElements[i];

      if (astElement != null) {
        if (t.isJSXElement(astElement) && isBase === false) {
          addKeyToElement((astElement: any), getUniqueJSXElementKey("" + i));
        } else if (t.isArrayExpression(astElement)) {
          applyKeysToNestedArray((astElement: any), false);
        } else if (astElement.type === "ConditionalExpression") {
          let alternate = (astElement.alternate: any);
          // it's common for conditions to be in an array, which means we need to check them for keys too
          if (t.isJSXElement(alternate.type) && isBase === false) {
            addKeyToElement(alternate, getUniqueJSXElementKey("0" + i));
          } else if (t.isArrayExpression(alternate.type)) {
            applyKeysToNestedArray(alternate, false);
          }
          let consequent = (astElement.consequent: any);
          if (t.isJSXElement(consequent.type) && isBase === false) {
            addKeyToElement(consequent, getUniqueJSXElementKey("1" + i));
          } else if (t.isArrayExpression(consequent.type)) {
            applyKeysToNestedArray(consequent, false);
          }
        }
      }
    }
  }
}
