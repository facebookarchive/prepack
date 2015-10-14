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
import { Value, BooleanValue, NumberValue, StringValue, UndefinedValue, NullValue, SymbolValue, ObjectValue, AbstractValue } from "../values/index.js";
import { Reference, EnvironmentRecord } from "../environment.js";
import { TypesDomain, ValuesDomain } from "../domains/index.js";
import invariant from "../invariant.js";
import {
  GetReferencedName,
  GetBase,
  GetValue,
  ToBooleanPartial,
  ToObjectPartial,
  ToNumber,
  ToInt32,
  IsSuperReference,
  IsCallable,
  IsUnresolvableReference,
  IsStrictReference,
  IsPropertyReference,
  IsToNumberPure
} from "../methods/index.js";
import * as t from "babel-types";
import type { BabelNodeUnaryExpression } from "babel-types";

function isInstance(proto, Constructor): boolean {
  return proto instanceof Constructor || proto === Constructor.prototype;
}

function computeAbstractly(realm, type, op, val) {
  return realm.createAbstract(new TypesDomain(type), ValuesDomain.topVal, [val],
    ([node]) => t.unaryExpression(op, node));
}

export default function (ast: BabelNodeUnaryExpression, strictCode: boolean, env: LexicalEnvironment, realm: Realm): Value | Reference {
  let expr = env.evaluate(ast.argument, strictCode);

  if (ast.operator === "-") {
    // ECMA262 12.5.7.1

    // 1. Let expr be the result of evaluating UnaryExpression.
    expr;

    // 2. Let oldValue be ? ToNumber(? GetValue(expr)).
    let value = GetValue(realm, expr);
    if (value instanceof AbstractValue && IsToNumberPure(realm, value)) return computeAbstractly(realm, NumberValue, "-", value);
    let oldValue = ToNumber(realm, value.throwIfNotConcrete());

    // 3. If oldValue is NaN, return NaN.
    if (isNaN(oldValue)) {
      return realm.intrinsics.NaN;
    }

    // 4. Return the result of negating oldValue; that is, compute a Number with the same magnitude but opposite sign.
    return new NumberValue(realm, -oldValue);
  } else if (ast.operator === "+") {
    // ECMA262 12.5.6.1

    // 1. Let expr be the result of evaluating UnaryExpression.
    expr;

    // 2. Return ? ToNumber(? GetValue(expr)).
    let value = GetValue(realm, expr);
    if (value instanceof AbstractValue && IsToNumberPure(realm, value)) return computeAbstractly(realm, NumberValue, "+", value);
    return new NumberValue(realm, ToNumber(realm, value.throwIfNotConcrete()));
  } else if (ast.operator === "~") {
    // ECMA262 12.5.8

    // 1. Let expr be the result of evaluating UnaryExpression.
    expr;

    // 2. Let oldValue be ? ToInt32(? GetValue(expr)).
    let value = GetValue(realm, expr);
    if (value instanceof AbstractValue && IsToNumberPure(realm, value)) return computeAbstractly(realm, NumberValue, "~", value);
    let oldValue = ToInt32(realm, value.throwIfNotConcrete());

    // 3. Return the result of applying bitwise complement to oldValue. The result is a signed 32-bit integer.
    return new NumberValue(realm, ~oldValue);
  } else if (ast.operator === "!") {
    // ECMA262 12.6.9

    // 1. Let expr be the result of evaluating UnaryExpression.
    expr;

    // 2. Let oldValue be ToBoolean(? GetValue(expr)).
    let value = GetValue(realm, expr);
    if (value instanceof AbstractValue && value.mightNotBeObject()) return computeAbstractly(realm, NumberValue, "!", value);
    let oldValue = ToBooleanPartial(realm, value);

    // 3. If oldValue is true, return false.
    if (oldValue === true) return realm.intrinsics.false;

    // 4. Return true.
    return realm.intrinsics.true;
  } else if (ast.operator === "void") {
    // 1. Let expr be the result of evaluating UnaryExpression.
    expr;

    // 2. Perform ? GetValue(expr).
    GetValue(realm, expr);

    // 3. Return undefined.
    return realm.intrinsics.undefined;
  } else if (ast.operator === "typeof") {
    // ECMA262 12.6.5

    // 1. Let val be the result of evaluating UnaryExpression.
    let val = expr;

    // 2. If Type(val) is Reference, then
    if (val instanceof Reference) {
      // a. If IsUnresolvableReference(val) is true, return "undefined".
      if (IsUnresolvableReference(realm, val)) {
        return new StringValue(realm, "undefined");
      }
    }

    // 3. Let val be ? GetValue(val).
    val = GetValue(realm, val);

    // 4. Return a String according to Table 35.
    if (IsCallable(realm, val)) {
      return new StringValue(realm, "function");
    } else {
      let proto = val.getType().prototype;
      if (isInstance(proto, UndefinedValue)) {
        return new StringValue(realm, "undefined");
      } else if (isInstance(proto, NullValue)) {
        return new StringValue(realm, "object");
      } else if (isInstance(proto, StringValue)) {
        return new StringValue(realm, "string");
      } else if (isInstance(proto, BooleanValue)) {
        return new StringValue(realm, "boolean");
      } else if (isInstance(proto, NumberValue)) {
        return new StringValue(realm, "number");
      } else if (isInstance(proto, SymbolValue)) {
        return new StringValue(realm, "symbol");
      } else if (isInstance(proto, ObjectValue)) {
        return new StringValue(realm, "object");
      } else {
        invariant(val instanceof AbstractValue);
        return computeAbstractly(realm, StringValue, "typeof", val);
      }
    }
  } else if (ast.operator === "delete") {
    // ECMA262 12.5.3.2

    // 1. Let ref be the result of evaluating UnaryExpression.
    let ref = expr;

    // 2. ReturnIfAbrupt(ref).

    // 3. If Type(ref) is not Reference, return true.
    if (!(ref instanceof Reference)) return realm.intrinsics.true;

    // 4. If IsUnresolvableReference(ref) is true, then
    if (IsUnresolvableReference(realm, ref)) {
      // a. Assert: IsStrictReference(ref) is false.
      invariant(!IsStrictReference(realm, ref), "expected strict reference");

      // b. Return true.
      return realm.intrinsics.true;
    }

    // 5. If IsPropertyReference(ref) is true, then
    if (IsPropertyReference(realm, ref)) {
      // a. If IsSuperReference(ref) is true, throw a ReferenceError exception.
      if (IsSuperReference(realm, ref)) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.ReferenceError);
      }

      // b. Let baseObj be ! ToObject(GetBase(ref)).
      let base = GetBase(realm, ref);
      invariant(base instanceof Value);
      let baseObj = ToObjectPartial(realm, base);

      // c. Let deleteStatus be ? baseObj.[[Delete]](GetReferencedName(ref)).
      let deleteStatus = baseObj.$Delete(GetReferencedName(realm, ref));

      // d. If deleteStatus is false and IsStrictReference(ref) is true, throw a TypeError exception.
      if (!deleteStatus && IsStrictReference(realm, ref)) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
      }

      // e. Return deleteStatus.
      return new BooleanValue(realm, deleteStatus);
    }

    // 6. Else ref is a Reference to an Environment Record binding,
    // a. Let bindings be GetBase(ref).
    let bindings = GetBase(realm, ref);
    invariant(bindings instanceof EnvironmentRecord);

    // b. Return ? bindings.DeleteBinding(GetReferencedName(ref)).
    let referencedName = GetReferencedName(realm, ref);
    invariant(typeof referencedName === "string");
    return new BooleanValue(realm, bindings.DeleteBinding(referencedName));
  }

  throw new Error("unimplemented");
}
