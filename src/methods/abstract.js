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
import type { PropertyKeyValue } from "../types.js";
import { CompilerDiagnostic, FatalError } from "../errors.js";
import {
  BoundFunctionValue,
  EmptyValue,
  NumberValue,
  IntegralValue,
  SymbolValue,
  StringValue,
  NullValue,
  ObjectValue,
  Value,
  BooleanValue,
  UndefinedValue,
  ConcreteValue,
  AbstractValue,
} from "../values/index.js";
import { Call } from "./call.js";
import { IsCallable } from "./is.js";
import { Completion, ReturnCompletion, ThrowCompletion } from "../completions.js";
import { GetMethod, Get } from "./get.js";
import { HasCompatibleType } from "./has.js";
import { To } from "../singletons.js";
import type { BabelNodeSourceLocation, BabelBinaryOperator } from "@babel/types";
import invariant from "../invariant.js";

export const URIReserved = ";/?:@&=+$,";
export const URIAlpha = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const DecimalDigit = "0123456789";
export const URIMark = "-_.!~*'()";
export const URIUnescaped = URIAlpha + DecimalDigit + URIMark;

// ECMA262 21.1.3.17.1
export function SplitMatch(realm: Realm, S: string, q: number, R: string): false | number {
  // 1. Assert: Type(R) is String.
  invariant(typeof R === "string", "expected a string");

  // 2. Let r be the number of code units in R.
  let r = R.length;

  // 3. Let s be the number of code units in S.
  let s = S.length;

  // 4. If q+r > s, return false.
  if (q + r > s) return false;

  // 5. If there exists an integer i between 0 (inclusive) and r (exclusive) such that the code unit at index
  //    q+i of S is different from the code unit at index i of R, return false.
  for (let i = 0; i < r; i++) {
    if (S[q + i] !== R[i]) {
      return false;
    }
  }

  // 6. Return q+r.
  return q + r;
}

// ECMA262 7.2.1
export function RequireObjectCoercible(
  realm: Realm,
  arg: Value,
  argLoc?: ?BabelNodeSourceLocation
): AbstractValue | ObjectValue | BooleanValue | StringValue | SymbolValue | NumberValue {
  if (!arg.mightNotBeNull() || !arg.mightNotBeUndefined()) {
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "null or undefined");
  }
  if (arg instanceof AbstractValue && (arg.mightBeNull() || arg.mightBeUndefined())) {
    if (realm.isInPureScope()) {
      // In a pure function it is ok to throw if this happens to be null or undefined.
      return arg;
    }
    if (argLoc) {
      let error = new CompilerDiagnostic(
        `member expression object ${AbstractValue.describe(arg)} is unknown`,
        argLoc,
        "PP0012",
        "FatalError"
      );
      realm.handleError(error);
      throw new FatalError();
    }
    arg.throwIfNotConcrete();
  }
  return (arg: any);
}

export function HasSameType(x: ConcreteValue, y: ConcreteValue): boolean {
  const xType = x.getType();
  const yType = y.getType();
  return (
    xType === yType ||
    ((xType === IntegralValue || xType === NumberValue) && (yType === IntegralValue || yType === NumberValue))
  );
}

// ECMA262 7.2.12 Abstract Relational Comparison
export function AbstractRelationalComparison(
  realm: Realm,
  x: ConcreteValue,
  y: ConcreteValue,
  LeftFirst: boolean,
  op: BabelBinaryOperator
): BooleanValue | UndefinedValue | AbstractValue {
  let px, py;

  // 1. If the LeftFirst flag is true, then
  if (LeftFirst) {
    // a. Let px be ? ToPrimitive(x, hint Number).
    px = To.ToPrimitiveOrAbstract(realm, x, "number");

    // b. Let py be ? ToPrimitive(y, hint Number).
    py = To.ToPrimitiveOrAbstract(realm, y, "number");
  } else {
    // 2. Else the order of evaluation needs to be reversed to preserve left to right evaluation
    // a. Let py be ? ToPrimitive(y, hint Number).
    py = To.ToPrimitiveOrAbstract(realm, y, "number");

    // b. Let px be ? ToPrimitive(x, hint Number).
    px = To.ToPrimitiveOrAbstract(realm, x, "number");
  }

  if (px instanceof AbstractValue || py instanceof AbstractValue) {
    let res;
    if (LeftFirst) {
      res = AbstractValue.createFromBinaryOp(realm, op, px, py);
    } else {
      res = AbstractValue.createFromBinaryOp(realm, op, py, px);
    }
    invariant(res instanceof BooleanValue || res instanceof UndefinedValue || res instanceof AbstractValue);
    return res;
  }

  // 3. If both px and py are Strings, then
  if (px instanceof StringValue && py instanceof StringValue) {
    // a. If py is a prefix of px, return false. (A String value p is a prefix of String value q if q can be the result of concatenating p and some other String r. Note that any String is a prefix of itself, because r may be the empty String.)
    if (px.value.startsWith(py.value)) return realm.intrinsics.false;

    // b. If px is a prefix of py, return true.
    if (py.value.startsWith(px.value)) return realm.intrinsics.true;

    // c. Let k be the smallest nonnegative integer such that the code unit at index k within px is different from the code unit at index k within py. (There must be such a k, for neither String is a prefix of the other.)
    let k = 0;
    while (px.value.charCodeAt(k) === py.value.charCodeAt(k)) {
      k += 1;
    }

    // d. Let m be the integer that is the code unit value at index k within px.
    let m = px.value.charCodeAt(k);

    // e. Let n be the integer that is the code unit value at index k within py.
    let n = py.value.charCodeAt(k);

    // f. If m < n, return true. Otherwise, return false.
    return m < n ? realm.intrinsics.true : realm.intrinsics.false;
  } else {
    // 4. Else,
    // a. Let nx be ? ToNumber(px). Because px and py are primitive values evaluation order is not important.
    let nx = To.ToNumber(realm, px);

    // b. Let ny be ? ToNumber(py).
    let ny = To.ToNumber(realm, py);

    // c. If nx is NaN, return undefined.
    if (isNaN(nx)) return realm.intrinsics.undefined;

    // d. If ny is NaN, return undefined.
    if (isNaN(ny)) return realm.intrinsics.undefined;

    // e. If nx and ny are the same Number value, return false.
    if (Object.is(nx, ny)) {
      return realm.intrinsics.false;
    }

    // f. If nx is +0 and ny is -0, return false.
    if (Object.is(nx, +0) && Object.is(ny, -0)) {
      return realm.intrinsics.false;
    }

    // g. If nx is -0 and ny is +0, return false.
    if (Object.is(nx, -0) && Object.is(ny, +0)) {
      return realm.intrinsics.false;
    }

    // h. If nx is +∞, return false.
    // i. If ny is +∞, return true.
    // j. If ny is -∞, return false.
    // k. If nx is -∞, return true.

    // i. If the mathematical value of nx is less than the mathematical value of ny —note that these
    //    mathematical values are both finite and not both zero—return true. Otherwise, return false.
    if (nx < ny) {
      return realm.intrinsics.true;
    } else {
      return realm.intrinsics.false;
    }
  }
}

// ECMA262 7.2.13
export function AbstractEqualityComparison(
  realm: Realm,
  x: ConcreteValue,
  y: ConcreteValue,
  op: BabelBinaryOperator
): BooleanValue | AbstractValue {
  // 1. If Type(x) is the same as Type(y), then
  if (HasSameType(x, y)) {
    // a. Return the result of performing Strict Equality Comparison x === y.
    const strictResult = StrictEqualityComparison(realm, x, y);
    return new BooleanValue(realm, op === "==" ? strictResult : !strictResult);
  }

  // 2. If x is null and y is undefined, return true.
  if (x instanceof NullValue && y instanceof UndefinedValue) {
    return new BooleanValue(realm, op === "==");
  }

  // 3. If x is undefined and y is null, return true.
  if (x instanceof UndefinedValue && y instanceof NullValue) {
    return new BooleanValue(realm, op === "==");
  }

  // 4. If Type(x) is Number and Type(y) is String, return the result of the comparison x == ToNumber(y).
  if (x instanceof NumberValue && y instanceof StringValue) {
    return AbstractEqualityComparison(realm, x, new NumberValue(realm, To.ToNumber(realm, y)), op);
  }

  // 5. If Type(x) is String and Type(y) is Number, return the result of the comparison ToNumber(x) == y.
  if (x instanceof StringValue && y instanceof NumberValue) {
    return AbstractEqualityComparison(realm, new NumberValue(realm, To.ToNumber(realm, x)), y, op);
  }

  // 6. If Type(x) is Boolean, return the result of the comparison ToNumber(x) == y.
  if (x instanceof BooleanValue) {
    return AbstractEqualityComparison(realm, new NumberValue(realm, To.ToNumber(realm, x)), y, op);
  }

  // 7. If Type(y) is Boolean, return the result of the comparison x == ToNumber(y).
  if (y instanceof BooleanValue) {
    return AbstractEqualityComparison(realm, x, new NumberValue(realm, To.ToNumber(realm, y)), op);
  }

  // 8. If Type(x) is either String, Number, or Symbol and Type(y) is Object, return the result of the comparison x == ToPrimitive(y).
  if ((x instanceof StringValue || x instanceof NumberValue || x instanceof SymbolValue) && y instanceof ObjectValue) {
    const py = To.ToPrimitiveOrAbstract(realm, y);
    if (py instanceof AbstractValue) {
      let res = AbstractValue.createFromBinaryOp(realm, "==", x, py);
      invariant(res instanceof BooleanValue || res instanceof AbstractValue);
      return res;
    }
    return AbstractEqualityComparison(realm, x, py, op);
  }

  // 9. If Type(x) is Object and Type(y) is either String, Number, or Symbol, return the result of the comparison ToPrimitive(x) == y.
  if (x instanceof ObjectValue && (y instanceof StringValue || y instanceof NumberValue || y instanceof SymbolValue)) {
    const px = To.ToPrimitiveOrAbstract(realm, x);
    if (px instanceof AbstractValue) {
      let res = AbstractValue.createFromBinaryOp(realm, "==", px, y);
      invariant(res instanceof BooleanValue || res instanceof AbstractValue);
      return res;
    }
    return AbstractEqualityComparison(realm, px, y, op);
  }

  // 10. Return false.
  return new BooleanValue(realm, op !== "==");
}

// ECMA262 7.2.14 Strict Equality Comparison
export function StrictEqualityComparison(realm: Realm, x: ConcreteValue, y: ConcreteValue): boolean {
  // 1. If Type(x) is different from Type(y), return false.
  if (!HasSameType(x, y)) {
    return false;
  }

  // 2. If Type(x) is Number, then
  if (x instanceof NumberValue && y instanceof NumberValue) {
    // a. If x is NaN, return false.
    if (isNaN(x.value)) return false;

    // b. If y is NaN, return false.
    if (isNaN(y.value)) return false;

    // c. If x is the same Number value as y, return true.
    // d. If x is +0 and y is -0, return true. (handled by c)
    // e. If x is -0 and y is +0, return true. (handled by c)
    if (x.value === y.value) return true;

    // f. Return false.
    return false;
  }

  // 3. Return SameValueNonNumber(x, y).
  return SameValueNonNumber(realm, x, y);
}

export function StrictEqualityComparisonPartial(realm: Realm, x: Value, y: Value): boolean {
  return StrictEqualityComparison(realm, x.throwIfNotConcrete(), y.throwIfNotConcrete());
}

// ECMA262 7.2.10
export function SameValueZero(realm: Realm, x: ConcreteValue, y: ConcreteValue): boolean {
  // 1. If Type(x) is different from Type(y), return false.
  if (!HasSameType(x, y)) {
    return false;
  }

  // 2. If Type(x) is Number, then
  if (x instanceof NumberValue) {
    invariant(y instanceof NumberValue);

    // a. If x is NaN and y is NaN, return true.
    if (isNaN(x.value) && isNaN(y.value)) return true;

    // b. If x is +0 and y is -0, return true.
    if (Object.is(x.value, +0) && Object.is(y.value, -0)) return true;

    // c. If x is -0 and y is +0, return true.
    if (Object.is(x.value, -0) && Object.is(y.value, +0)) return true;

    // d. If x is the same Number value as y, return true.
    if (x.value === y.value) return true;

    // e. Return false.
    return false;
  }

  // 3. Return SameValueNonNumber(x, y).
  return SameValueNonNumber(realm, x, y);
}

export function SameValueZeroPartial(realm: Realm, x: Value, y: Value): boolean {
  return SameValueZero(realm, x.throwIfNotConcrete(), y.throwIfNotConcrete());
}

// ECMA262 7.2.9
export function SameValue(realm: Realm, x: ConcreteValue, y: ConcreteValue): boolean {
  // 1. If Type(x) is different from Type(y), return false.
  if (!HasSameType(x, y)) {
    return false;
  }

  // 2. If Type(x) is Number, then
  if (x instanceof NumberValue && y instanceof NumberValue) {
    // a. If x is NaN and y is NaN, return true.
    if (isNaN(x.value) && isNaN(y.value)) return true;

    // b. If x is +0 and y is -0, return false.
    if (Object.is(x.value, +0) && Object.is(y.value, -0)) return false;

    // c. If x is -0 and y is +0, return false.
    if (Object.is(x.value, -0) && Object.is(y.value, +0)) return false;

    // d. If x is the same Number value as y, return true.
    if (x.value === y.value) return true;

    // e. Return false.
    return false;
  }

  // 3. Return SameValueNonNumber(x, y).
  return SameValueNonNumber(realm, x, y);
}

export function SameValuePartial(realm: Realm, x: Value, y: Value): boolean {
  return SameValue(realm, x.throwIfNotConcrete(), y.throwIfNotConcrete());
}

// ECMA262 7.2.11
export function SameValueNonNumber(realm: Realm, x: ConcreteValue, y: ConcreteValue): boolean {
  // 1. Assert: Type(x) is not Number.
  invariant(!(x instanceof NumberValue), "numbers not allowed");

  // 2. Assert: Type(x) is the same as Type(y).
  invariant(x.getType() === y.getType(), "must be same type");

  // 3. If Type(x) is Undefined, return true.
  if (x instanceof UndefinedValue) return true;

  // 4. If Type(x) is Null, return true.
  if (x instanceof NullValue) return true;

  // 5. If Type(x) is String, then
  if (x instanceof StringValue && y instanceof StringValue) {
    // a. If x and y are exactly the same sequence of code units (same length and same code units at corresponding indices), return true; otherwise, return false.
    return x.value === y.value;
  }

  // 6. If Type(x) is Boolean, then
  if (x instanceof BooleanValue && y instanceof BooleanValue) {
    // a. If x and y are both true or both false, return true; otherwise, return false.
    return x.value === y.value;
  }

  // 7. If Type(x) is Symbol, then
  if (x instanceof SymbolValue) {
    // a. If x and y are both the same Symbol value, return true; otherwise, return false.
    return x === y;
  }

  // 8. Return true if x and y are the same Object value. Otherwise, return false.
  return x === y;
}

// Checks if two property keys are identical.
export function SamePropertyKey(realm: Realm, x: PropertyKeyValue, y: PropertyKeyValue): boolean {
  if (typeof x === "string" && typeof y === "string") {
    return x === y;
  }
  if (x instanceof StringValue && y instanceof StringValue) {
    return x.value === y.value;
  }
  if (x instanceof SymbolValue && y instanceof SymbolValue) {
    return x === y;
  }
  return false;
}

// ECMA262 12.8.5 Applying the Additive Operators to Numbers
export function Add(realm: Realm, a: number, b: number, subtract?: boolean = false): NumberValue {
  // If either operand is NaN, the result is NaN.
  if (isNaN(a) || isNaN(b)) {
    return realm.intrinsics.NaN;
  }

  // The sum of two infinities of opposite sign is NaN.
  // The sum of two infinities of the same sign is the infinity of that sign.
  // The sum of an infinity and a finite value is equal to the infinite operand.
  // The sum of two negative zeroes is -0. The sum of two positive zeroes, or of two zeroes of opposite sign, is +0.
  // The sum of a zero and a nonzero finite value is equal to the nonzero operand.
  // The sum of two nonzero finite values of the same magnitude and opposite sign is +0.

  let anum = a;
  let bnum = b;

  // The - operator performs subtraction when applied to two operands of numeric type,
  // producing the difference of its operands; the left operand is the minuend and the right
  // operand is the subtrahend. Given numeric operands a and b, it is always the case that
  // a-b produces the same result as a+(-b).
  if (subtract) {
    bnum = -bnum;
  }

  return IntegralValue.createFromNumberValue(realm, anum + bnum);
}

// ECMA262 12.10.4
export function InstanceofOperator(realm: Realm, O: Value, C: Value): boolean {
  // 1. If Type(C) is not Object, throw a TypeError exception.
  if (!C.mightBeObject()) {
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Expecting a function in instanceof check");
  }

  // 2. Let instOfHandler be ? GetMethod(C, @@hasInstance).
  let instOfHandler = GetMethod(realm, C, realm.intrinsics.SymbolHasInstance);

  // 3. If instOfHandler is not undefined, then
  if (!(instOfHandler instanceof UndefinedValue)) {
    // a. Return ToBoolean(? Call(instOfHandler, C, « O »)).
    return To.ToBooleanPartial(realm, Call(realm, instOfHandler, C, [O]));
  }

  // 4. If IsCallable(C) is false, throw a TypeError exception.
  if (IsCallable(realm, C) === false) {
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Expecting a function in instanceof check");
  }

  // 5. Return ? OrdinaryHasInstance(C, O).
  return OrdinaryHasInstance(realm, C, O);
}

// ECMA262 7.3.19
export function OrdinaryHasInstance(realm: Realm, C: Value, O: Value): boolean {
  // 1. If IsCallable(C) is false, return false.
  if (IsCallable(realm, C) === false) return false;
  invariant(C instanceof ObjectValue);

  // 2. If C has a [[BoundTargetFunction]] internal slot, then
  if (C instanceof BoundFunctionValue) {
    // a. Let BC be the value of C's [[BoundTargetFunction]] internal slot.
    let BC = C.$BoundTargetFunction;

    // b. Return ? InstanceofOperator(O, BC).
    return InstanceofOperator(realm, O, BC);
  }

  // 3. If Type(O) is not Object, return false.
  O = O.throwIfNotConcrete();
  if (!(O instanceof ObjectValue)) return false;

  // 4. Let P be ? Get(C, "prototype").
  let P = Get(realm, C, "prototype").throwIfNotConcrete();

  // 5. If Type(P) is not Object, throw a TypeError exception.
  if (!(P instanceof ObjectValue)) {
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Type(P) is not Object");
  }

  // 6. Repeat
  while (true) {
    // a. Let O be ? O.[[GetPrototypeOf]]().
    O = O.$GetPrototypeOf();

    // b. If O is null, return false.
    if (O instanceof NullValue) return false;

    // c. If SameValue(P, O) is true, return true.
    if (SameValuePartial(realm, P, O) === true) return true;
  }

  return false;
}

//
export function Type(realm: Realm, val: Value): string {
  if (val instanceof UndefinedValue) {
    return "Undefined";
  } else if (val instanceof NullValue) {
    return "Null";
  } else if (HasCompatibleType(val, BooleanValue)) {
    return "Boolean";
  } else if (HasCompatibleType(val, StringValue)) {
    return "String";
  } else if (HasCompatibleType(val, SymbolValue)) {
    return "Symbol";
  } else if (HasCompatibleType(val, IntegralValue)) {
    return "Number";
  } else if (HasCompatibleType(val, NumberValue)) {
    return "Number";
  } else if (!val.mightNotBeObject()) {
    return "Object";
  } else {
    invariant(val instanceof AbstractValue);
    AbstractValue.reportIntrospectionError(val);
    throw new FatalError();
  }
}

// ECMA262 19.4.3.2.1
export function SymbolDescriptiveString(realm: Realm, sym: SymbolValue): string {
  // 1. Assert: Type(sym) is Symbol.
  invariant(sym instanceof SymbolValue, "expected symbol");

  // 2. Let desc be sym's [[Description]] value.
  let desc = sym.$Description;

  // 3. If desc is undefined, let desc be the empty string.
  if (!desc) desc = "";
  else desc = desc.throwIfNotConcreteString().value;

  // 4. Assert: Type(desc) is String.
  invariant(typeof desc === "string", "expected string");

  // 5. Return the result of concatenating the strings "Symbol(", desc, and ")".
  return `Symbol(${desc})`;
}

// ECMA262 6.2.2.5
export function UpdateEmpty(realm: Realm, completionRecord: Completion | Value, value: Value): Completion | Value {
  // 1. Assert: If completionRecord.[[Type]] is either return or throw, then completionRecord.[[Value]] is not empty.
  if (completionRecord instanceof ReturnCompletion || completionRecord instanceof ThrowCompletion) {
    invariant(completionRecord.value, "expected completion record to have a value");
  }

  // 2. If completionRecord.[[Value]] is not empty, return Completion(completionRecord).
  if (completionRecord instanceof EmptyValue) return value;
  if (completionRecord instanceof Value || (completionRecord.value && !(completionRecord.value instanceof EmptyValue)))
    return completionRecord;

  // 3. Return Completion{[[Type]]: completionRecord.[[Type]], [[Value]]: value, [[Target]]: completionRecord.[[Target]] }.'
  completionRecord.value = value;
  return completionRecord;
}
