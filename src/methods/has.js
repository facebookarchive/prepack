/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import { FatalError } from "../errors.js";
import type { Realm } from "../realm.js";
import type { PropertyKeyValue } from "../types.js";
import { IsPropertyKey } from "./index.js";
import { Value, AbstractValue, ObjectValue, NullValue, AbstractObjectValue } from "../values/index.js";
import { Properties } from "../singletons.js";
import invariant from "../invariant.js";
import type { BabelNodeExpression } from "@babel/types";

// 12.2.1.2 Static Semantics: HasName
// 14.1.9 Static Semantics: HasName
// 14.2.7 Static Semantics: HasName
// 14.5.6 Static Semantics: HasName
// 14.2.7 Static Semantics: HasName

export function HasName(realm: Realm, ast: BabelNodeExpression): boolean {
  // 12.2.1.2 Static Semantics: HasName
  // CoverParenthesizedExpressionAndArrowParameterList

  // 14.2.7 Static Semantics: HasName
  if (ast.type === "ArrowFunctionExpression") return false;

  // 14.1.9 Static Semantics: HasName
  if (ast.type === "FunctionExpression") {
    // FunctionExpression: function (FormalParameters) {FunctionBody}
    if (ast.id === null)
      // 1. Return false.
      return false;
    // FunctionExpression: functionBindingIdentifier (FormalParameters) {FunctionBody}
    if (ast.id !== null)
      // 2. Return true
      return true;
  }

  // 14.5.6 Static Semantics: HasName
  if (ast.type === "ClassExpression") {
    // ClassExpression : class ClassTail
    if (ast.id === null)
      //1. Return false.
      return false;
    // ClassExpression : class BindingIdentifier ClassTail
    if (ast.id !== null)
      //1. return true;
      return true;
  }
  // 14.4.7 Static Semantics: HasName
  // GeneratorExpression
  throw Error("Unexpected AST node type  : " + ast.type);
}

// ECMA262 7.3.10
export function HasProperty(realm: Realm, O: ObjectValue | AbstractObjectValue, P: PropertyKeyValue): boolean {
  // 1. Assert: Type(O) is Object.

  // 2. Assert: IsPropertyKey(P) is true.
  invariant(IsPropertyKey(realm, P), "expected property key");

  // 3. Return ? O.[[HasProperty]](P).
  return O.$HasProperty(P);
}

// ECMA262 7.3.11
export function HasOwnProperty(realm: Realm, O: ObjectValue | AbstractObjectValue, P: PropertyKeyValue): boolean {
  // 1. Assert: Type(O) is Object.

  // 2. Assert: IsPropertyKey(P) is true.
  invariant(IsPropertyKey(realm, P), "not a valid property key");

  // 3. Let desc be ? O.[[GetOwnProperty]](P).
  let desc = O.$GetOwnProperty(P);

  // 4. If desc is undefined, return false.
  if (desc === undefined) return false;
  Properties.ThrowIfMightHaveBeenDeleted(desc);

  // 5. Return true.
  return true;
}

// ECMA262 9.1.7.1
export function OrdinaryHasProperty(realm: Realm, O: ObjectValue, P: PropertyKeyValue): boolean {
  // 1. Assert: IsPropertyKey(P) is true.
  invariant(typeof P === "string" || IsPropertyKey(realm, P), "expected property key");

  // 2. Let hasOwn be ? O.[[GetOwnProperty]](P).
  let hasOwn = O.$GetOwnProperty(P);

  // 3. If hasOwn is not undefined, return true.
  if (hasOwn !== undefined) {
    Properties.ThrowIfMightHaveBeenDeleted(hasOwn);
    return true;
  }

  // 4. Let parent be ? O.[[GetPrototypeOf]]().
  let parent = O.$GetPrototypeOf();

  // 5. If parent is not null, then
  if (!(parent instanceof NullValue)) {
    invariant(parent instanceof ObjectValue);

    // a. Return ? parent.[[HasProperty]](P).
    return parent.$HasProperty(P);
  }

  // 6. Return false.
  return false;
}

// Checks if the given value is equal to or a subtype of the given type.
// If the value is an abstract value without precise type information,
// an introspection error is thrown.
export function HasCompatibleType(value: Value, type: typeof Value): boolean {
  let valueType = value.getType();
  if (valueType === Value) {
    invariant(value instanceof AbstractValue);
    AbstractValue.reportIntrospectionError(value);
    throw new FatalError();
  }
  return Value.isTypeCompatibleWith(valueType, type);
}

export function HasSomeCompatibleType(value: Value, ...manyTypes: Array<typeof Value>): boolean {
  let valueType = value.getType();
  if (valueType === Value) {
    invariant(value instanceof AbstractValue);
    AbstractValue.reportIntrospectionError(value);
    throw new FatalError();
  }
  return manyTypes.some(Value.isTypeCompatibleWith.bind(null, valueType));
}
