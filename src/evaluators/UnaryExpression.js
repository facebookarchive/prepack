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
import { AbruptCompletion, PossiblyNormalCompletion } from "../completions.js";
import { CompilerDiagnostic, FatalError } from "../errors.js";
import { TypesDomain, ValuesDomain } from "../domains/index.js";
import {
  AbstractObjectValue,
  Value,
  BooleanValue,
  ConcreteValue,
  NumberValue,
  IntegralValue,
  StringValue,
  UndefinedValue,
  NullValue,
  SymbolValue,
  ObjectValue,
  AbstractValue,
} from "../values/index.js";
import { Reference, EnvironmentRecord } from "../environment.js";
import invariant from "../invariant.js";
import { IsCallable } from "../methods/index.js";
import { Environment, To, Leak } from "../singletons.js";
import * as t from "babel-types";
import type { BabelNodeUnaryExpression } from "babel-types";

function isInstance(proto, Constructor): boolean {
  return proto instanceof Constructor || proto === Constructor.prototype;
}

function evaluateDeleteOperation(expr: Value | Reference, realm: Realm) {
  // ECMA262 12.5.3.2

  // 1. Let ref be the result of evaluating UnaryExpression.
  let ref = expr;

  // 2. ReturnIfAbrupt(ref).

  // 3. If Type(ref) is not Reference, return true.
  if (!(ref instanceof Reference)) return realm.intrinsics.true;

  // 4. If IsUnresolvableReference(ref) is true, then
  if (Environment.IsUnresolvableReference(realm, ref)) {
    // a. Assert: IsStrictReference(ref) is false.
    invariant(!Environment.IsStrictReference(realm, ref), "did not expect a strict reference");

    // b. Return true.
    return realm.intrinsics.true;
  }

  // 5. If IsPropertyReference(ref) is true, then
  if (Environment.IsPropertyReference(realm, ref)) {
    // a. If IsSuperReference(ref) is true, throw a ReferenceError exception.
    if (Environment.IsSuperReference(realm, ref)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.ReferenceError);
    }

    // b. Let baseObj be ! ToObject(GetBase(ref)).
    let base = Environment.GetBase(realm, ref);
    if (base instanceof AbstractValue && !(base instanceof AbstractObjectValue)) {
      // if the base is abstract but not an abstract object, we have a type error
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }
    // Constructing the reference checks that base is coercible to an object hence
    invariant(base instanceof ConcreteValue || base instanceof AbstractObjectValue);
    let baseObj = base instanceof ConcreteValue ? To.ToObject(realm, base) : base;

    // c. Let deleteStatus be ? baseObj.[[Delete]](GetReferencedName(ref)).
    let deleteStatus = baseObj.$Delete(Environment.GetReferencedName(realm, ref));

    // d. If deleteStatus is false and IsStrictReference(ref) is true, throw a TypeError exception.
    if (!deleteStatus && Environment.IsStrictReference(realm, ref)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // e. Return deleteStatus.
    return new BooleanValue(realm, deleteStatus);
  }

  // 6. Else ref is a Reference to an Environment Record binding,
  // a. Let bindings be GetBase(ref).
  let bindings = Environment.GetBase(realm, ref);
  invariant(bindings instanceof EnvironmentRecord);

  // b. Return ? bindings.DeleteBinding(GetReferencedName(ref)).
  let referencedName = Environment.GetReferencedName(realm, ref);
  invariant(typeof referencedName === "string");
  return new BooleanValue(realm, bindings.DeleteBinding(referencedName));
}

function generateRuntimeCall(ref: Reference | Value, ast: BabelNodeUnaryExpression, strictCode: boolean, realm: Realm) {
  invariant(ref instanceof Reference);
  let value;
  let propertyName;

  // the base reference might be an EnvironmentRecord or a ObjectValue
  // if it is a EnvironmentRecord, we don't serialize a member expression below
  if (Environment.IsPropertyReference(realm, ref)) {
    value = Environment.GetBase(realm, ref);
    invariant(value instanceof Value);
    if (!value.isSimpleObject()) {
      Leak.leakValue(realm, value, ast.loc);
    }
    propertyName = Environment.GetReferencedName(realm, ref);
  } else {
    value = Environment.GetValue(realm, ref);
    invariant(value instanceof Value);
  }

  return AbstractValue.createTemporalFromBuildFunction(realm, Value, [value], nodes => {
    let arg;
    if (propertyName) {
      invariant(typeof propertyName === "string");
      arg = t.isValidIdentifier(propertyName)
        ? t.memberExpression(nodes[0], t.identifier(propertyName), false)
        : t.memberExpression(nodes[0], t.stringLiteral(propertyName), true);
    } else {
      arg = nodes[0];
    }
    return t.unaryExpression(ast.operator, arg, ast.prefix);
  });
}

function tryToEvaluateOperationOrLeaveAsAbstract(
  ast: BabelNodeUnaryExpression,
  expr: Value | Reference,
  func: (ast: BabelNodeUnaryExpression, expr: Value | Reference, strictCode: boolean, realm: Realm) => Value,
  strictCode: boolean,
  realm: Realm
) {
  let effects;
  try {
    effects = realm.evaluateForEffects(() => func(ast, expr, strictCode, realm));
  } catch (error) {
    if (error instanceof FatalError) {
      return realm.evaluateWithPossibleThrowCompletion(
        () => generateRuntimeCall(expr, ast, strictCode, realm),
        TypesDomain.topVal,
        ValuesDomain.topVal
      );
    } else {
      throw error;
    }
  }
  let completion = effects[0];
  if (completion instanceof PossiblyNormalCompletion) {
    // in this case one of the branches may complete abruptly, which means that
    // not all control flow branches join into one flow at this point.
    // Consequently we have to continue tracking changes until the point where
    // all the branches come together into one.
    completion = realm.composeWithSavedCompletion(completion);
  }

  // Note that the effects of (non joining) abrupt branches are not included
  // in joinedEffects, but are tracked separately inside completion.
  realm.applyEffects(effects);
  // return or throw completion
  if (completion instanceof AbruptCompletion) throw completion;
  invariant(completion instanceof Value);
  return completion;
}

function evaluateOperation(
  ast: BabelNodeUnaryExpression,
  expr: Value | Reference,
  strictCode: boolean,
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

  if (ast.operator === "+") {
    // ECMA262 12.5.6.1

    // 1. Let expr be the result of evaluating UnaryExpression.
    expr;

    // 2. Return ? ToNumber(? GetValue(expr)).
    let value = Environment.GetValue(realm, expr);
    if (value instanceof AbstractValue) {
      if (!To.IsToNumberPure(realm, value)) reportError();
      return AbstractValue.createFromUnaryOp(realm, "+", value);
    }
    invariant(value instanceof ConcreteValue);

    return IntegralValue.createFromNumberValue(realm, To.ToNumber(realm, value));
  } else if (ast.operator === "-") {
    // ECMA262 12.5.7.1

    // 1. Let expr be the result of evaluating UnaryExpression.
    expr;

    // 2. Let oldValue be ? ToNumber(? GetValue(expr)).
    let value = Environment.GetValue(realm, expr);
    if (value instanceof AbstractValue) {
      if (!To.IsToNumberPure(realm, value)) reportError();
      return AbstractValue.createFromUnaryOp(realm, "-", value);
    }
    invariant(value instanceof ConcreteValue);
    let oldValue = To.ToNumber(realm, value);

    // 3. If oldValue is NaN, return NaN.
    if (isNaN(oldValue)) {
      return realm.intrinsics.NaN;
    }

    // 4. Return the result of negating oldValue; that is, compute a Number with the same magnitude but opposite sign.
    return IntegralValue.createFromNumberValue(realm, -oldValue);
  } else if (ast.operator === "~") {
    // ECMA262 12.5.8

    // 1. Let expr be the result of evaluating UnaryExpression.
    expr;

    // 2. Let oldValue be ? ToInt32(? GetValue(expr)).
    let value = Environment.GetValue(realm, expr);
    if (value instanceof AbstractValue) {
      if (!To.IsToNumberPure(realm, value)) reportError();
      return AbstractValue.createFromUnaryOp(realm, "~", value);
    }
    invariant(value instanceof ConcreteValue);
    let oldValue = To.ToInt32(realm, value);

    // 3. Return the result of applying bitwise complement to oldValue. The result is a signed 32-bit integer.
    return IntegralValue.createFromNumberValue(realm, ~oldValue);
  } else if (ast.operator === "!") {
    // ECMA262 12.6.9

    // 1. Let expr be the result of evaluating UnaryExpression.
    expr;

    // 2. Let oldValue be ToBoolean(? GetValue(expr)).
    let value = Environment.GetValue(realm, expr);
    if (value instanceof AbstractValue) return AbstractValue.createFromUnaryOp(realm, "!", value);
    invariant(value instanceof ConcreteValue);
    let oldValue = To.ToBoolean(realm, value);

    // 3. If oldValue is true, return false.
    if (oldValue === true) return realm.intrinsics.false;

    // 4. Return true.
    return realm.intrinsics.true;
  } else if (ast.operator === "void") {
    // 1. Let expr be the result of evaluating UnaryExpression.
    expr;

    // 2. Perform ? GetValue(expr).
    Environment.GetValue(realm, expr);

    // 3. Return undefined.
    return realm.intrinsics.undefined;
  } else if (ast.operator === "typeof") {
    // ECMA262 12.6.5

    // 1. Let val be the result of evaluating UnaryExpression.
    let val = expr;

    // 2. If Type(val) is Reference, then
    if (val instanceof Reference) {
      // a. If IsUnresolvableReference(val) is true, return "undefined".
      if (Environment.IsUnresolvableReference(realm, val)) {
        return new StringValue(realm, "undefined");
      }
    }

    // 3. Let val be ? GetValue(val).
    val = Environment.GetValue(realm, val);

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
    return evaluateDeleteOperation(expr, realm);
  }
}

export default function(
  ast: BabelNodeUnaryExpression,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): Value {
  let expr = env.evaluate(ast.argument, strictCode);

  if (realm.isInPureScope()) {
    return tryToEvaluateOperationOrLeaveAsAbstract(ast, expr, evaluateOperation, strictCode, realm);
  } else {
    return evaluateOperation(ast, expr, strictCode, realm);
  }
}
