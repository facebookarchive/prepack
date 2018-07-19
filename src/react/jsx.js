/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import * as t from "@babel/types";
import type {
  BabelNodeExpression,
  BabelNodeJSXMemberExpression,
  BabelNodeJSXIdentifier,
  BabelNodeIdentifier,
  BabelNodeMemberExpression,
  BabelNodeStringLiteral,
} from "@babel/types";
import invariant from "../invariant.js";
import { isReactComponent } from "./utils.js";

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

export function convertKeyValueToJSXAttribute(key: string, expr: BabelNodeExpression): BabelNode {
  let wrapInContainer = true;

  if (expr && t.isStringLiteral(expr) && typeof expr.value === "string") {
    let value = expr.value;
    wrapInContainer = value.includes('"') || value.includes("'");
  }
  return t.jSXAttribute(
    t.jSXIdentifier(key),
    wrapInContainer ? t.jSXExpressionContainer(expr) : ((expr: any): BabelNodeStringLiteral)
  );
}
