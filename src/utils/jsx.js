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

export function convertExpressionToJSXIdentifier(expr) {
  switch (expr.type) {
    case "ThisExpression":
      return t.jSXIdentifier("this");
    case "Identifier":
      return t.jSXIdentifier(expr.name);
    case "StringLiteral":
      return t.jSXIdentifier(expr.value);
    case "MemberExpression":
      if (expr.computed) {
        throw new Error("Cannot inline computed expressions in JSX type.");
      }
      return t.jSXMemberExpression(
        convertExpressionToJSXIdentifier(expr.object),
        convertExpressionToJSXIdentifier(expr.property)
      );
    case "ArrowFunctionExpression":
      return expr;
    default:
      throw new Error("Invalid JSX Type: " + expr.type);
  }
}

export function convertKeyValueToJSXAttribute(key, expr) {
  return t.jSXAttribute(t.jSXIdentifier(key), expr.type === "StringLiteral" ? expr : t.jSXExpressionContainer(expr));
}
