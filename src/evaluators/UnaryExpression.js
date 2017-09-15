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
import { CompilerDiagnostic, FatalError } from "../errors.js";
import {
  AbstractObjectValue,
  Value,
  BooleanValue,
  ConcreteValue,
  NumberValue,
  StringValue,
  UndefinedValue,
  NullValue,
  SymbolValue,
  ObjectValue,
  AbstractValue,
} from "../values/index.js";
import { Reference, EnvironmentRecord } from "../environment.js";
import invariant from "../invariant.js";
import {
  GetReferencedName,
  GetBase,
  GetValue,
  ToBoolean,
  ToObject,
  ToNumber,
  ToInt32,
  IsSuperReference,
  IsCallable,
  IsUnresolvableReference,
  IsStrictReference,
  IsPropertyReference,
  IsToNumberPure,
} from "../methods/index.js";
import simplifyAbstractValue from "../utils/simplifier.js";
import type { BabelNodeUnaryExpression } from "babel-types";

function isInstance(proto, Constructor): boolean {
  return proto instanceof Constructor || proto === Constructor.prototype;
}

export default function(
  ast: BabelNodeUnaryExpression,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): Value {
  function reportError() {
    let error = new CompilerDiagnostic(
      "might be a symbol or an object with an unknown valueOf or toString or Symbol.toPrimitive method",
      ast.argument.loc,
      "PP0008",
      "RecoverableError"
    );
    if (realm.handleError(error) === "Fail") throw new FatalError();
  }

  let expr = env.evaluate(ast.argument, strictCode);

  if (ast.operator === "+") {
    // ECMA262 12.5.6.1

    // 1. Let expr be the result of evaluating UnaryExpression.
    expr;

    // 2. Return ? ToNumber(? GetValue(expr)).
    let value = GetValue(realm, expr);
    if (value instanceof AbstractValue) {
      if (!IsToNumberPure(realm, value)) reportError();
      return AbstractValue.createFromUnaryOp(realm, "+", value);
    }
    invariant(value instanceof ConcreteValue);

    return new NumberValue(realm, ToNumber(realm, value));
  } else if (ast.operator === "-") {
    // ECMA262 12.5.7.1

    // 1. Let expr be the result of evaluating UnaryExpression.
    expr;

    // 2. Let oldValue be ? ToNumber(? GetValue(expr)).
    let value = GetValue(realm, expr);
    if (value instanceof AbstractValue) {
      if (!IsToNumberPure(realm, value)) reportError();
      return AbstractValue.createFromUnaryOp(realm, "-", value);
    }
    invariant(value instanceof ConcreteValue);
    let oldValue = ToNumber(realm, value);

    // 3. If oldValue is NaN, return NaN.
    if (isNaN(oldValue)) {
      return realm.intrinsics.NaN;
    }

    // 4. Return the result of negating oldValue; that is, compute a Number with the same magnitude but opposite sign.
    return new NumberValue(realm, -oldValue);
  } else if (ast.operator === "~") {
    // ECMA262 12.5.8

    // 1. Let expr be the result of evaluating UnaryExpression.
    expr;

    // 2. Let oldValue be ? ToInt32(? GetValue(expr)).
    let value = GetValue(realm, expr);
    if (value instanceof AbstractValue) {
      if (!IsToNumberPure(realm, value)) reportError();
      return AbstractValue.createFromUnaryOp(realm, "~", value);
    }
    invariant(value instanceof ConcreteValue);
    let oldValue = ToInt32(realm, value);

    // 3. Return the result of applying bitwise complement to oldValue. The result is a signed 32-bit integer.
    return new NumberValue(realm, ~oldValue);
  } else if (ast.operator === "!") {
    // ECMA262 12.6.9

    // 1. Let expr be the result of evaluating UnaryExpression.
    expr;

    // 2. Let oldValue be ToBoolean(? GetValue(expr)).
    let value = GetValue(realm, expr);
    if (value instanceof AbstractValue) {
      if (!value.mightNotBeTrue()) return realm.intrinsics.false;
      if (!value.mightNotBeFalse()) return realm.intrinsics.true;
      return simplifyAbstractValue(realm, AbstractValue.createFromUnaryOp(realm, "!", value));
    }
    invariant(value instanceof ConcreteValue);
    let oldValue = ToBoolean(realm, value);

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
      if (IsCallable(realm, val)) {
        return new StringValue(realm, "function");
      }
      return new StringValue(realm, "object");
    } else {
      invariant(val instanceof AbstractValue);
      return AbstractValue.createFromUnaryOp(realm, "typeof", val);
    }
  } else {
    invariant(ast.operator === "delete");
    // ECMA262 12.5.3.2

    // 1. Let ref be the result of evaluating UnaryExpression.
    let ref = expr;

    // 2. ReturnIfAbrupt(ref).

    // 3. If Type(ref) is not Reference, return true.
    if (!(ref instanceof Reference)) return realm.intrinsics.true;

    // 4. If IsUnresolvableReference(ref) is true, then
    if (IsUnresolvableReference(realm, ref)) {
      // a. Assert: IsStrictReference(ref) is false.
      invariant(!IsStrictReference(realm, ref), "did not expect a strict reference");

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
      // Constructing the reference checks that base is coercible to an object hence
      invariant(base instanceof ConcreteValue || base instanceof AbstractObjectValue);
      let baseObj = base instanceof ConcreteValue ? ToObject(realm, base) : base;

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
}
