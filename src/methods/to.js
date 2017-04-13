/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { Descriptor, CallableObjectValue } from "../types.js";
import type { Realm } from "../realm.js";
import { GetMethod, Get } from "./get.js";
import { StringCreate } from "./create.js";
import { HasProperty } from "./has.js";
import { Construct } from "./construct.js";
import { Call } from "./call.js";
import { IsCallable } from "./is.js";
import { SameValue, SameValueZero } from "./abstract.js";
import { ThrowCompletion } from "../completions.js";
import { Value, ConcreteValue, PrimitiveValue, UndefinedValue, BooleanValue, ObjectValue, SymbolValue, StringValue, NumberValue, NullValue, AbstractValue, AbstractObjectValue } from "../values/index.js";
import invariant from "../invariant.js";

type numberOrValue = number | Value;

function modulo(x: number, y: number): number {
  return x < 0 ? (x % y + y) : (x % y);
}

// ECMA262 7.1.5
export function ToInt32(realm: Realm, argument: numberOrValue): number {
  // 1. Let number be ? ToNumber(argument).
  let number = ToNumber(realm, argument);

  // 2. If number is NaN, +0, -0, +∞, or -∞, return +0.
  if (isNaN(number) || number === 0 || !isFinite(number)) return +0;

  // 3. Let int be the mathematical value that is the same sign as number and whose magnitude is floor(abs(number)).
  let int = number < 0 ? -Math.floor(Math.abs(number)) : Math.floor(Math.abs(number));

  // 4. Let int16bit be int modulo 2^32.
  let int32bit = modulo(int, Math.pow(2, 32));

  // 5. If int32bit ≥ 2^31, return int32bit - 2^32; otherwise return int32bit.
  return int32bit >= Math.pow(2, 31) ? int32bit - Math.pow(2, 32) : int32bit;
}

// ECMA262 7.1.6
export function ToUint32(realm: Realm, argument: numberOrValue): number {
  // 1. Let number be ? ToNumber(argument).
  let number = ToNumber(realm, argument);

  // 2. If number is NaN, +0, -0, +∞, or -∞, return +0.
  if (isNaN(number) || number === 0 || !isFinite(number)) return +0;

  // 3. Let int be the mathematical value that is the same sign as number and whose magnitude is floor(abs(number)).
  let int = number < 0 ? -Math.floor(Math.abs(number)) : Math.floor(Math.abs(number));

  // 4. Let int16bit be int modulo 2^32.
  let int32bit = modulo(int, Math.pow(2, 32));

  // 5. Return int32bit.
  return int32bit;
}

// ECMA262 7.1.7
export function ToInt16(realm: Realm, argument: numberOrValue): number {
  // 1. Let number be ? ToNumber(argument).
  let number = ToNumber(realm, argument);

  // 2. If number is NaN, +0, -0, +∞, or -∞, return +0.
  if (isNaN(number) || number === 0 || !isFinite(number)) return +0;

  // 3. Let int be the mathematical value that is the same sign as number and whose magnitude is floor(abs(number)).
  let int = number < 0 ? -Math.floor(Math.abs(number)) : Math.floor(Math.abs(number));

  // 4. Let int16bit be int modulo 2^16.
  let int16bit = modulo(int, Math.pow(2, 16));

  // 5. If int16bit ≥ 2^15, return int16bit - 2^16; otherwise return int16bit.
  return int16bit >= Math.pow(2, 15) ? int16bit - Math.pow(2, 16) : int16bit;
}

// ECMA262 7.1.8
export function ToUint16(realm: Realm, argument: numberOrValue): number {
  // 1. Let number be ? ToNumber(argument).
  let number = ToNumber(realm, argument);

  // 2. If number is NaN, +0, -0, +∞, or -∞, return +0.
  if (isNaN(number) || number === 0 || !isFinite(number)) return +0;

  // 3. Let int be the mathematical value that is the same sign as number and whose magnitude is floor(abs(number)).
  let int = number < 0 ? -Math.floor(Math.abs(number)) : Math.floor(Math.abs(number));

  // 4. Let int16bit be int modulo 2^16.
  let int16bit = modulo(int, Math.pow(2, 16));

  // 5. Return int16bit.
  return int16bit;
}

// ECMA262 7.1.9
export function ToInt8(realm: Realm, argument: numberOrValue): number {
  // 1. Let number be ? ToNumber(argument).
  let number = ToNumber(realm, argument);

  // 2. If number is NaN, +0, -0, +∞, or -∞, return +0.
  if (isNaN(number) || number === 0 || !isFinite(number)) return +0;

  // 3. Let int be the mathematical value that is the same sign as number and whose magnitude is floor(abs(number)).
  let int = number < 0 ? -Math.floor(Math.abs(number)) : Math.floor(Math.abs(number));

  // 4. Let int8bit be int modulo 2^8.
  let int8bit = modulo(int, Math.pow(2, 8));

  // 5. If int8bit ≥ 2^7, return int8bit - 2^8; otherwise return int8bit.
  return int8bit >= Math.pow(2, 7) ? int8bit - Math.pow(2, 8) : int8bit;
}

// ECMA262 7.1.10
export function ToUint8(realm: Realm, argument: numberOrValue): number {
  // 1. Let number be ? ToNumber(argument).
  let number = ToNumber(realm, argument);

  // 2. If number is NaN, +0, -0, +∞, or -∞, return +0.
  if (isNaN(number) || number === 0 || !isFinite(number)) return +0;

  // 3. Let int be the mathematical value that is the same sign as number and whose magnitude is floor(abs(number)).
  let int = number < 0 ? -Math.floor(Math.abs(number)) : Math.floor(Math.abs(number));

  // 4. Let int8bit be int modulo 2^8.
  let int8bit = modulo(int, Math.pow(2, 8));

  // 5. Return int8bit.
  return int8bit;
}

// ECMA262 7.1.11
export function ToUint8Clamp(realm: Realm, argument: numberOrValue): number {
  // 1. Let number be ? ToNumber(argument).
  let number = ToNumber(realm, argument);

  // 2. If number is NaN, return +0.
  if (isNaN(number)) return +0;

  // 3. If number ≤ 0, return +0.
  if (number <= 0) return +0;

  // 4. If number ≥ 255, return 255.
  if (number >= 255) return 255;

  // 5. Let f be floor(number).
  let f = Math.floor(number);

  // 6. If f + 0.5 < number, return f + 1.
  if (f + 0.5 < number) return f + 1;

  // 7. If number < f + 0.5, return f.
  if (number < f + 0.5) return f;

  // 8. If f is odd, return f + 1.
  if (f % 2 === 1) return f + 1;

  // 9. Return f.
  return f;
}

// ECMA262 19.3.3.1
export function thisBooleanValue(realm: Realm, value: Value): BooleanValue {
  // 1. If Type(value) is Boolean, return value.
  if (value instanceof BooleanValue) return value;

  // 2. If Type(value) is Object and value has a [[BooleanData]] internal slot, then
  if (value instanceof ObjectValue && "$BooleanData" in value) {
    // a. Assert: value's [[BooleanData]] internal slot is a Boolean value.
    invariant(value.$BooleanData instanceof BooleanValue, "expected boolean data internal slot to be a boolean value");

    // b. Return the value of value's [[BooleanData]] internal slot.
    return value.$BooleanData;
  }

  value.throwIfNotConcrete();

  // 3. Throw a TypeError exception.
  throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
}

// ECMA262 20.1.3
export function thisNumberValue(realm: Realm, value: Value): NumberValue {
  // 1. If Type(value) is Number, return value.
  if (value instanceof NumberValue) return value;

  // 2. If Type(value) is Object and value has a [[NumberData]] internal slot, then
  if (value instanceof ObjectValue && "$NumberData" in value) {
    // a. Assert: value's [[NumberData]] internal slot is a Number value.
    invariant(value.$NumberData instanceof NumberValue, "expected number data internal slot to be a number value");

    // b. Return the value of value's [[NumberData]] internal slot.
    return value.$NumberData;
  }

  value = value.throwIfNotConcrete();

  // 3. Throw a TypeError exception.
  throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
}

// ECMA262 21.1.3
export function thisStringValue(realm: Realm, value: Value): StringValue {
  // 1. If Type(value) is String, return value.
  if (value instanceof StringValue) return value;

  // 2. If Type(value) is Object and value has a [[StringData]] internal slot, then
  if (value instanceof ObjectValue && "$StringData" in value) {
    // a. Assert: value's [[StringData]] internal slot is a String value.
    invariant(value.$StringData instanceof StringValue, "expected string data internal slot to be a string value");

    // b. Return the value of value's [[StringData]] internal slot.
    return value.$StringData;
  }

  value = value.throwIfNotConcrete();

  // 3. Throw a TypeError exception.
  throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
}

// ECMA262 6.2.4.5
export function ToPropertyDescriptor(realm: Realm, Obj: Value): Descriptor {
  Obj = Obj.throwIfNotConcrete();

  // 1. If Type(Obj) is not Object, throw a TypeError exception.
  if (!(Obj instanceof ObjectValue)) {
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
  }

  // 2. Let desc be a new Property Descriptor that initially has no fields.
  let desc: Descriptor = {};

  // 3. Let hasEnumerable be ? HasProperty(Obj, "enumerable").
  let hasEnumerable = HasProperty(realm, Obj, "enumerable");

  // 4. If hasEnumerable is true, then
  if (hasEnumerable === true) {
    // a. Let enum be ToBoolean(? Get(Obj, "enumerable")).
    let enu = ToBooleanPartial(realm, Get(realm, Obj, "enumerable"));

    // b. Set the [[Enumerable]] field of desc to enum.
    desc.enumerable = enu === true;
  }

  // 5. Let hasConfigurable be ? HasProperty(Obj, "configurable").
  let hasConfigurable = HasProperty(realm, Obj, "configurable");

  // 6. If hasConfigurable is true, then
  if (hasConfigurable === true) {
    // a. Let conf be ToBoolean(? Get(Obj, "configurable")).
    let conf = ToBooleanPartial(realm, Get(realm, Obj, "configurable"));

    // b. Set the [[Configurable]] field of desc to conf.
    desc.configurable = conf === true;
  }

  // 7. Let hasValue be ? HasProperty(Obj, "value").
  let hasValue = HasProperty(realm, Obj, "value");

  // 8. If hasValue is true, then
  if (hasValue === true) {
    // a. Let value be ? Get(Obj, "value").
    let value = Get(realm, Obj, "value");

    // b. Set the [[Value]] field of desc to value.
    desc.value = value;
  }

  // 9. Let hasWritable be ? HasProperty(Obj, "writable").
  let hasWritable = HasProperty(realm, Obj, "writable");

  // 10. If hasWritable is true, then
  if (hasWritable === true) {
    // a. Let writable be ToBoolean(? Get(Obj, "writable")).
    let writable = ToBooleanPartial(realm, Get(realm, Obj, "writable"));

    // b. Set the [[Writable]] field of desc to writable.
    desc.writable = writable === true;
  }

  // 11. Let hasGet be ? HasProperty(Obj, "get").
  let hasGet = HasProperty(realm, Obj, "get");

  // 12. If hasGet is true, then
  if (hasGet === true) {
    // a. Let getter be ? Get(Obj, "get").
    let getter = Get(realm, Obj, "get");

    // b. If IsCallable(getter) is false and getter is not undefined, throw a TypeError exception.
    if (IsCallable(realm, getter) === false && !getter.mightBeUndefined()) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }
    getter.throwIfNotConcrete();

    // c. Set the [[Get]] field of desc to getter.
    desc.get = ((getter: any): CallableObjectValue | UndefinedValue);
  }

  // 13. Let hasSet be ? HasProperty(Obj, "set").
  let hasSet = HasProperty(realm, Obj, "set");

  // 14. If hasSet is true, then
  if (hasSet === true) {
    // a. Let setter be ? Get(Obj, "set").
    let setter = Get(realm, Obj, "set");

    // b. If IsCallable(setter) is false and setter is not undefined, throw a TypeError exception.
    if (IsCallable(realm, setter) === false && !setter.mightBeUndefined()) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }
    setter.throwIfNotConcrete();

    // c. Set the [[Set]] field of desc to setter.
    desc.set = ((setter: any): CallableObjectValue | UndefinedValue);
  }

  // 15. If either desc.[[Get]] or desc.[[Set]] is present, then
  if (desc.get || desc.set) {
    // a. If either desc.[[Value]] or desc.[[Writable]] is present, throw a TypeError exception.
    if ("value" in desc || "writable" in desc) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }
  }

  // 16. Return desc.
  return desc;
}

// ECMA262 7.1.13
export function ToObject(realm: Realm, arg: ConcreteValue): ObjectValue {
  if (arg instanceof UndefinedValue) {
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
  } else if (arg instanceof NullValue) {
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
  } else if (arg instanceof BooleanValue) {
    let obj = new ObjectValue(realm, realm.intrinsics.BooleanPrototype);
    obj.$BooleanData = arg;
    return obj;
  } else if (arg instanceof NumberValue) {
    let obj = new ObjectValue(realm, realm.intrinsics.NumberPrototype);
    obj.$NumberData = arg;
    return obj;
  } else if (arg instanceof StringValue) {
    let obj = StringCreate(realm, arg, realm.intrinsics.StringPrototype);
    return obj;
  } else if (arg instanceof SymbolValue) {
    let obj = new ObjectValue(realm, realm.intrinsics.SymbolPrototype);
    obj.$SymbolData = arg;
    return obj;
  } else if (arg instanceof ObjectValue) {
    return arg;
  }
  invariant(false);
}

export function ToObjectPartial(realm: Realm, arg: Value): ObjectValue | AbstractObjectValue {
  if (arg instanceof AbstractObjectValue) return arg;
  arg = arg.throwIfNotConcrete();
  return ToObject(realm, arg);
}

// ECMA262 7.1.15
export function ToLength(realm: Realm, argument: numberOrValue): number {
  // Let len be ? ToInteger(argument).
  let len = ToInteger(realm, argument);

  // If len ≤ +0, return +0.
  if (len <= 0) return +0;

  // If len is +∞, return 2^53-1.
  if (len === +Infinity) return Math.pow(2, 53) - 1;

  // Return min(len, 2^53-1).
  return Math.min(len, Math.pow(2, 53) - 1);
}

// ECMA262 7.1.4
export function ToInteger(realm: Realm, argument: numberOrValue): number {
  // 1. Let number be ? ToNumber(argument).
  let number = ToNumber(realm, argument);

  // 2. If number is NaN, return +0.
  if (isNaN(number)) return +0;

  // 3. If number is +0, -0, +∞, or -∞, return number.
  if (!isFinite(number) || number === 0) return number;

  // 4. Return the number value that is the same sign as number and whose magnitude is floor(abs(number)).
  return number < 0 ? -Math.floor(Math.abs(number)) : Math.floor(Math.abs(number));
}

// ECMA262 7.1.17
export function ToIndex(realm: Realm, value: number | ConcreteValue): number {
  let index;
  // 1. If value is undefined, then
  if (value instanceof UndefinedValue) {
    // a. Let index be 0.
    index = 0;
  } else { // 2. Else,
    // a. Let integerIndex be ? ToInteger(value).
    let integerIndex = ToInteger(realm, value);

    // b. If integerIndex < 0, throw a RangeError exception.
    if (integerIndex < 0) {
      throw new ThrowCompletion(
        Construct(realm, realm.intrinsics.RangeError, [new StringValue(realm, "integerIndex < 0")])
      );
    }

    // c. Let index be ! ToLength(integerIndex).
    index = ToLength(realm, integerIndex);

    // d. If SameValueZero(integerIndex, index) is false, throw a RangeError exception.
    if (SameValueZero(realm, new NumberValue(realm, integerIndex), new NumberValue(realm, index)) === false) {
      throw new ThrowCompletion(
        Construct(realm, realm.intrinsics.RangeError, [new StringValue(realm, "integerIndex < 0")])
      );
    }
  }
  // 3. Return index.
  return index;
}

export function ToIndexPartial(realm: Realm, value: numberOrValue): number {
  return ToIndex(realm, typeof value === "number" ? value : value.throwIfNotConcrete());
}

// ECMA262 7.1.3
export function ToNumber(realm: Realm, val: numberOrValue): number {
  if (typeof val === "number") {
    return val;
  } else if (val instanceof AbstractValue) {
    return AbstractValue.throwIntrospectionError(val);
  } else if (val instanceof UndefinedValue) {
    return NaN;
  } else if (val instanceof NullValue) {
    return +0;
  } else if (val instanceof ObjectValue) {
    let prim = ToPrimitive(realm, val, "number");
    return ToNumber(realm, prim);
  } else if (val instanceof BooleanValue) {
    if (val.value === true) {
      return 1;
    } else { // `val.value === false`
      return 0;
    }
  } else if (val instanceof NumberValue) {
    return val.value;
  } else if (val instanceof StringValue) {
    return Number(val.value);
  } else {
    throw new ThrowCompletion(
      Construct(realm, realm.intrinsics.TypeError, [new StringValue(realm, "unknown value type, can't coerce to a number")])
    );
  }
}

export function IsToNumberPure(realm: Realm, val: numberOrValue): boolean {
  // This carefully abstracts the behavior of IsToNumberSideEffectFree.
  if (val instanceof ObjectValue) return IsToPrimitivePure(realm, val);
  return true;
}

// ECMA262 7.1.1
export function ToPrimitive(realm: Realm, input: ConcreteValue, hint?: "default" | "string" | "number"): PrimitiveValue {
  if (input instanceof PrimitiveValue) {
    return input;
  }

  // When Type(input) is Object, the following steps are taken
  invariant(input instanceof ObjectValue, "expected an object");

  // 1. If PreferredType was not passed, let hint be "default".
  hint = hint || "default";

  // Following two steps are redundant since we just pass string hints.
  // 2. Else if PreferredType is hint String, let hint be "string".
  // 3. Else PreferredType is hint Number, let hint be "number".

  // 4. Let exoticToPrim be ? GetMethod(input, @@toPrimitive).
  let exoticToPrim = GetMethod(realm, input, realm.intrinsics.SymbolToPrimitive);

  // 5. If exoticToPrim is not undefined, then
  if (!(exoticToPrim instanceof UndefinedValue)) {
    // a. Let result be ? Call(exoticToPrim, input, « hint »).
    let result = Call(realm, exoticToPrim, input, [new StringValue(realm, hint)]);

    // b. If Type(result) is not Object, return result.
    if (!(result instanceof ObjectValue)) {
      invariant(result instanceof PrimitiveValue);
      return result;
    }

    // c. Throw a TypeError exception.
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
  }

  // 6. If hint is "default", let hint be "number".
  if (hint === "default") hint = "number";

  // 7. Return ? OrdinaryToPrimitive(input, hint).
  return OrdinaryToPrimitive(realm, input, hint);
}

// Returns result type of ToPrimitive if it is pure (terminates, does not throw exception, does not read or write heap), otherwise undefined.
export function GetToPrimitivePureResultType(realm: Realm, input: Value): void | typeof Value {
  // This carefully abstracts the behavior of ToPrimitive.
  if (input instanceof PrimitiveValue || input instanceof AbstractValue) return input.getType();
  invariant(input instanceof ObjectValue);
  return undefined;
}

export function IsToPrimitivePure(realm: Realm, input: Value) {
  return GetToPrimitivePureResultType(realm, input) !== undefined;
}

// ECMA262 7.1.1
export function OrdinaryToPrimitive(realm: Realm, input: ObjectValue, hint: "string" | "number"): PrimitiveValue {
  let methodNames;

  // 1. Assert: Type(O) is Object.
  invariant(input instanceof ObjectValue, "Expected object");

  // 2. Assert: Type(hint) is String and its value is either "string" or "number".
  invariant(hint === "string" || hint === "number", "Expected string or number hint");

  // 3. If hint is "string", then
  if (hint === "string") {
    // a. Let methodNames be « "toString", "valueOf" ».
    methodNames = ["toString", "valueOf"];
  } else { // 4. Else,
    // a. Let methodNames be « "valueOf", "toString" ».
    methodNames = ["valueOf", "toString"];
  }

  // 5. For each name in methodNames in List order, do
  for (let name of methodNames) {
    // a. Let method be ? Get(O, name).
    let method = Get(realm, input, new StringValue(realm, name));

    // b. If IsCallable(method) is true, then
    if (IsCallable(realm, method)) {
      // i. Let result be ? Call(method, O).
      let result = Call(realm, method, input);

      // ii. If Type(result) is not Object, return result.
      if (!(result instanceof ObjectValue)) {
        invariant(result instanceof PrimitiveValue);
        return result;
      }
    }
  }

  // 6. Throw a TypeError exception.
  throw new ThrowCompletion(
    Construct(realm, realm.intrinsics.TypeError, [new StringValue(realm, "can't turn to primitive")])
  );
}

// ECMA262 7.1.12
export function ToString(realm: Realm, val: string | ConcreteValue): string {
  if (typeof val === "string") {
    return val;
  } else if (val instanceof StringValue) {
    return val.value;
  } else if (val instanceof NumberValue) {
    return val.value + "";
  } else if (val instanceof UndefinedValue) {
    return "undefined";
  } else if (val instanceof NullValue) {
    return "null";
  } else if (val instanceof SymbolValue) {
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
  } else if (val instanceof BooleanValue) {
    return val.value ? "true" : "false";
  } else if (val instanceof ObjectValue) {
    let primValue = ToPrimitive(realm, val, "string");
    return ToString(realm, primValue);
  } else {
    throw new ThrowCompletion(
      Construct(realm, realm.intrinsics.TypeError, [new StringValue(realm, "unknown value type, can't coerce to string")])
    );
  }
}

export function ToStringPartial(realm: Realm, val: string | Value): string {
  return ToString(realm, typeof val === "string" ? val : val.throwIfNotConcrete());
}

// ECMA262 7.1.2
export function ToBoolean(realm: Realm, val: ConcreteValue): boolean {
  if (val instanceof BooleanValue) {
    return val.value;
  } else if (val instanceof UndefinedValue) {
    return false;
  } else if (val instanceof NullValue) {
    return false;
  } else if (val instanceof NumberValue) {
    return val.value !== 0 && !isNaN(val.value);
  } else if (val instanceof StringValue) {
    return val.value.length > 0;
  } else if (val instanceof ObjectValue) {
    return true;
  } else if (val instanceof SymbolValue) {
    return true;
  } else {
    invariant(!(val instanceof AbstractValue));
    throw new ThrowCompletion(
      Construct(realm, realm.intrinsics.TypeError, [new StringValue(realm, "unknown value type, can't coerce to a boolean")])
    );
  }
}

export function ToBooleanPartial(realm: Realm, val: Value): boolean {
  if (!val.mightNotBeObject()) return true;
  return ToBoolean(realm, val.throwIfNotConcrete());
}


// ECMA262 7.1.14
export function ToPropertyKey(realm: Realm, arg: ConcreteValue): SymbolValue | string /* but not StringValue */ {
  // 1. Let key be ? ToPrimitive(argument, hint String).
  let key = ToPrimitive(realm, arg, "string");

  // 2. If Type(key) is Symbol, then
  if (key instanceof SymbolValue) {
    // a. Return key.
    return key;
  }

  // 3. Return ! ToString(key).
  return ToString(realm, key);
}

// ECMA262 7.1.16
export function CanonicalNumericIndexString(realm: Realm, argument: StringValue): number | void {
  // 1. Assert: Type(argument) is String.
  invariant(argument instanceof StringValue);

  // 2. If argument is "-0", return −0.
  if (argument.value === "-0") return -0;

  // 3. Let n be ToNumber(argument).
  let n = ToNumber(realm, argument);

  // 4. If SameValue(ToString(n), argument) is false, return undefined.
  if (SameValue(realm, new StringValue(realm, ToString(realm, new NumberValue(realm, n))), argument) === false) return undefined;

  // 5. Return n.
  return n;
}
