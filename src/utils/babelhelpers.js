/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type {
  BabelNodeExpression,
  BabelNodeMemberExpression,
  BabelNodeStringLiteral,
  BabelNodeIdentifier,
  BabelNodeSourceLocation,
} from "@babel/types";
import * as t from "@babel/types";

export const voidExpression: BabelNodeExpression = t.unaryExpression("void", t.numericLiteral(0), true);
export const nullExpression: BabelNodeExpression = t.nullLiteral();
export const emptyExpression: BabelNodeIdentifier = t.identifier("__empty");
export const constructorExpression: BabelNodeIdentifier = t.identifier("__constructor");
export const protoExpression: BabelNodeIdentifier = t.identifier("__proto__");

export function getAsPropertyNameExpression(key: string, canBeIdentifier: boolean = true): BabelNodeExpression {
  // If key is a non-negative numeric string literal, parse it and set it as a numeric index instead.
  let index = Number.parseInt(key, 10);
  if (index >= 0 && index.toString() === key) {
    return t.numericLiteral(index);
  }

  if (canBeIdentifier) {
    // TODO #1020: revert this when Unicode identifiers are supported by all targetted JavaScript engines
    let keyIsAscii = /^[\u0000-\u007f]*$/.test(key);
    if (t.isValidIdentifier(key) && keyIsAscii) return t.identifier(key);
  }

  return t.stringLiteral(key);
}

export function memberExpressionHelper(
  object: BabelNodeExpression,
  property: string | BabelNodeExpression
): BabelNodeMemberExpression {
  let propertyExpression: BabelNodeExpression;
  let computed;
  if (typeof property === "string") {
    propertyExpression = getAsPropertyNameExpression(property);
    computed = !t.isIdentifier(propertyExpression);
  } else if (t.isStringLiteral(property)) {
    propertyExpression = getAsPropertyNameExpression(((property: any): BabelNodeStringLiteral).value);
    computed = !t.isIdentifier(propertyExpression);
  } else {
    propertyExpression = property;
    computed = true;
  }
  return t.memberExpression(object, propertyExpression, computed);
}

export function optionalStringOfLocation(location: ?BabelNodeSourceLocation): string {
  // if we can't get a value, then it's likely that the source file was not given
  return location ? ` at location ${stringOfLocation(location)}` : "";
}

export function stringOfLocation(location: BabelNodeSourceLocation): string {
  return `${location.source || "(unknown source file)"}[${location.start.line}:${location.start.column}]`;
}
