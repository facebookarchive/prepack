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
import { TypesDomain, ValuesDomain } from "../domains/index.js";
import { GetMethod, Get } from "./get.js";
import { Create } from "../singletons.js";
import { HasProperty } from "./has.js";
import { Call } from "./call.js";
import { CompilerDiagnostic, FatalError } from "../errors.js";
import { IsCallable } from "./is.js";
import { SameValue, SameValueZero } from "./abstract.js";
import {
  AbstractObjectValue,
  AbstractValue,
  BooleanValue,
  ConcreteValue,
  NullValue,
  NumberValue,
  IntegralValue,
  ObjectValue,
  PrimitiveValue,
  StringValue,
  SymbolValue,
  UndefinedValue,
  Value,
} from "../values/index.js";
import invariant from "../invariant.js";
import { createOperationDescriptor } from "../utils/generator.js";
import { PropertyDescriptor } from "../descriptors.js";

type ElementConvType = {
  Int8: (Realm, numberOrValue) => number,
  Int16: (Realm, numberOrValue) => number,
  Int32: (Realm, numberOrValue) => number,
  Uint8: (Realm, numberOrValue) => number,
  Uint16: (Realm, numberOrValue) => number,
  Uint32: (Realm, numberOrValue) => number,
  Uint8Clamped: (Realm, numberOrValue) => number,
};
type numberOrValue = number | Value;

function modulo(x: number, y: number): number {
  return x < 0 ? (x % y) + y : x % y;
}

export class ToImplementation {
  constructor() {
    this.ElementConv = {
      Int8: this.ToInt8.bind(this),
      Int16: this.ToInt16.bind(this),
      Int32: this.ToInt32.bind(this),
      Uint8: this.ToUint8.bind(this),
      Uint16: this.ToUint16.bind(this),
      Uint32: this.ToUint32.bind(this),
      Uint8Clamped: this.ToUint8Clamp.bind(this),
    };
  }

  ElementConv: ElementConvType;

  // ECMA262 7.1.5
  ToInt32(realm: Realm, argument: numberOrValue): number {
    // 1. Let number be ? ToNumber(argument).
    let number = this.ToNumber(realm, argument);

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
  ToUint32(realm: Realm, argument: numberOrValue): number {
    // 1. Let number be ? ToNumber(argument).
    let number = this.ToNumber(realm, argument);

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
  ToInt16(realm: Realm, argument: numberOrValue): number {
    // 1. Let number be ? ToNumber(argument).
    let number = this.ToNumber(realm, argument);

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
  ToUint16(realm: Realm, argument: numberOrValue): number {
    // 1. Let number be ? ToNumber(argument).
    let number = this.ToNumber(realm, argument);

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
  ToInt8(realm: Realm, argument: numberOrValue): number {
    // 1. Let number be ? ToNumber(argument).
    let number = this.ToNumber(realm, argument);

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
  ToUint8(realm: Realm, argument: numberOrValue): number {
    // 1. Let number be ? ToNumber(argument).
    let number = this.ToNumber(realm, argument);

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
  ToUint8Clamp(realm: Realm, argument: numberOrValue): number {
    // 1. Let number be ? ToNumber(argument).
    let number = this.ToNumber(realm, argument);

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
  thisBooleanValue(realm: Realm, value: Value): BooleanValue {
    // 1. If Type(value) is Boolean, return value.
    if (value instanceof BooleanValue) return value;

    // 2. If Type(value) is Object and value has a [[BooleanData]] internal slot, then
    if (value instanceof ObjectValue && value.$BooleanData) {
      const booleanData = value.$BooleanData.throwIfNotConcreteBoolean();
      // a. Assert: value's [[BooleanData]] internal slot is a Boolean value.
      invariant(booleanData instanceof BooleanValue, "expected boolean data internal slot to be a boolean value");

      // b. Return the value of value's [[BooleanData]] internal slot.
      return booleanData;
    }

    value.throwIfNotConcrete();

    // 3. Throw a TypeError exception.
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
  }

  // ECMA262 20.1.3
  thisNumberValue(realm: Realm, value: Value): NumberValue {
    // 1. If Type(value) is Number, return value.
    if (value instanceof NumberValue) return value;

    // 2. If Type(value) is Object and value has a [[NumberData]] internal slot, then
    if (value instanceof ObjectValue && value.$NumberData) {
      const numberData = value.$NumberData.throwIfNotConcreteNumber();
      // a. Assert: value's [[NumberData]] internal slot is a Number value.
      invariant(numberData instanceof NumberValue, "expected number data internal slot to be a number value");

      // b. Return the value of value's [[NumberData]] internal slot.
      return numberData;
    }

    value = value.throwIfNotConcrete();

    // 3. Throw a TypeError exception.
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
  }

  // ECMA262 21.1.3
  thisStringValue(realm: Realm, value: Value): StringValue {
    // 1. If Type(value) is String, return value.
    if (value instanceof StringValue) return value;

    // 2. If Type(value) is Object and value has a [[StringData]] internal slot, then
    if (value instanceof ObjectValue && value.$StringData) {
      const stringData = value.$StringData.throwIfNotConcreteString();
      // a. Assert: value's [[StringData]] internal slot is a String value.
      invariant(stringData instanceof StringValue, "expected string data internal slot to be a string value");

      // b. Return the value of value's [[StringData]] internal slot.
      return stringData;
    }

    value = value.throwIfNotConcrete();

    // 3. Throw a TypeError exception.
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
  }

  // ECMA262 6.2.4.5
  ToPropertyDescriptor(realm: Realm, Obj: Value): Descriptor {
    Obj = Obj.throwIfNotConcrete();

    // 1. If Type(Obj) is not Object, throw a TypeError exception.
    if (!(Obj instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 2. Let desc be a new Property Descriptor that initially has no fields.
    let desc = new PropertyDescriptor({});

    // 3. Let hasEnumerable be ? HasProperty(Obj, "enumerable").
    let hasEnumerable = HasProperty(realm, Obj, "enumerable");

    // 4. If hasEnumerable is true, then
    if (hasEnumerable === true) {
      // a. Let enum be ToBoolean(? Get(Obj, "enumerable")).
      let enu = this.ToBooleanPartial(realm, Get(realm, Obj, "enumerable"));

      // b. Set the [[Enumerable]] field of desc to enum.
      desc.enumerable = enu === true;
    }

    // 5. Let hasConfigurable be ? HasProperty(Obj, "configurable").
    let hasConfigurable = HasProperty(realm, Obj, "configurable");

    // 6. If hasConfigurable is true, then
    if (hasConfigurable === true) {
      // a. Let conf be ToBoolean(? Get(Obj, "configurable")).
      let conf = this.ToBooleanPartial(realm, Get(realm, Obj, "configurable"));

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
      let writable = this.ToBooleanPartial(realm, Get(realm, Obj, "writable"));

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
      if (desc.value !== undefined || desc.writable !== undefined) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
      }
    }

    // 16. Return desc.
    return desc;
  }

  // ECMA262 7.1.13
  ToObject(realm: Realm, arg: Value): ObjectValue | AbstractObjectValue {
    if (arg instanceof AbstractObjectValue) return arg;
    if (arg instanceof AbstractValue) {
      return this._WrapAbstractInObject(realm, arg);
    }
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
      let obj = Create.StringCreate(realm, arg, realm.intrinsics.StringPrototype);
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

  _WrapAbstractInObject(realm: Realm, arg: AbstractValue): ObjectValue | AbstractObjectValue {
    let obj;
    switch (arg.getType()) {
      case IntegralValue:
      case NumberValue:
        obj = new ObjectValue(realm, realm.intrinsics.NumberPrototype);
        obj.$NumberData = arg;
        break;

      case StringValue:
        obj = new ObjectValue(realm, realm.intrinsics.StringPrototype);
        obj.$StringData = arg;
        break;

      case BooleanValue:
        obj = new ObjectValue(realm, realm.intrinsics.BooleanPrototype);
        obj.$BooleanData = arg;
        break;

      case SymbolValue:
        obj = new ObjectValue(realm, realm.intrinsics.SymbolPrototype);
        obj.$SymbolData = arg;
        break;

      case UndefinedValue:
      case NullValue:
      case PrimitiveValue:
        if (arg.mightBeNull() || arg.mightHaveBeenDeleted() || arg.mightBeUndefined())
          throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);

      /*eslint-disable */
      default:
        /*eslint-enable */
        if (realm.isInPureScope()) {
          // will be serialized as Object.assign(serialized_arg)
          obj = AbstractValue.createFromType(realm, ObjectValue, "explicit conversion to object", [arg]);
          invariant(obj instanceof AbstractObjectValue);
        } else {
          obj = arg.throwIfNotConcreteObject();
        }
        break;
    }
    return obj;
  }

  // ECMA262 7.1.15
  ToLength(realm: Realm, argument: numberOrValue): number {
    // Let len be ? ToInteger(argument).
    let len = this.ToInteger(realm, argument);

    // If len ≤ +0, return +0.
    if (len <= 0) return +0;

    // If len is +∞, return 2^53-1.
    if (len === +Infinity) return Math.pow(2, 53) - 1;

    // Return min(len, 2^53-1).
    return Math.min(len, Math.pow(2, 53) - 1);
  }

  // ECMA262 7.1.4
  ToInteger(realm: Realm, argument: numberOrValue): number {
    // 1. Let number be ? ToNumber(argument).
    let number = this.ToNumber(realm, argument);

    // 2. If number is NaN, return +0.
    if (isNaN(number)) return +0;

    // 3. If number is +0, -0, +∞, or -∞, return number.
    if (!isFinite(number) || number === 0) return number;

    // 4. Return the number value that is the same sign as number and whose magnitude is floor(abs(number)).
    return number < 0 ? -Math.floor(Math.abs(number)) : Math.floor(Math.abs(number));
  }

  // ECMA262 7.1.17
  ToIndex(realm: Realm, value: number | ConcreteValue): number {
    let index;
    // 1. If value is undefined, then
    if (value instanceof UndefinedValue) {
      // a. Let index be 0.
      index = 0;
    } else {
      // 2. Else,
      // a. Let integerIndex be ? ToInteger(value).
      let integerIndex = this.ToInteger(realm, value);

      // b. If integerIndex < 0, throw a RangeError exception.
      if (integerIndex < 0) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.RangeError, "integerIndex < 0");
      }

      // c. Let index be ! ToLength(integerIndex).
      index = this.ToLength(realm, integerIndex);

      // d. If SameValueZero(integerIndex, index) is false, throw a RangeError exception.
      if (SameValueZero(realm, new NumberValue(realm, integerIndex), new NumberValue(realm, index)) === false) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.RangeError, "integerIndex < 0");
      }
    }
    // 3. Return index.
    return index;
  }

  ToIndexPartial(realm: Realm, value: numberOrValue): number {
    return this.ToIndex(realm, typeof value === "number" ? value : value.throwIfNotConcrete());
  }

  ToNumber(realm: Realm, val: numberOrValue): number {
    const num = this.ToNumberOrAbstract(realm, val);
    if (typeof num !== "number") {
      AbstractValue.reportIntrospectionError(num);
      throw new FatalError();
    }
    return num;
  }

  // ECMA262 7.1.3
  ToNumberOrAbstract(realm: Realm, val: numberOrValue | AbstractValue): AbstractValue | number {
    if (typeof val === "number") {
      return val;
    } else if (val instanceof AbstractValue) {
      return val;
    } else if (val instanceof UndefinedValue) {
      return NaN;
    } else if (val instanceof NullValue) {
      return +0;
    } else if (val instanceof ObjectValue) {
      let prim = this.ToPrimitiveOrAbstract(realm, val, "number");
      return this.ToNumberOrAbstract(realm, prim);
    } else if (val instanceof BooleanValue) {
      if (val.value === true) {
        return 1;
      } else {
        // `val.value === false`
        return 0;
      }
    } else if (val instanceof NumberValue) {
      return val.value;
    } else if (val instanceof StringValue) {
      return Number(val.value);
    } else if (val instanceof SymbolValue) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    } else {
      invariant(false, "unexpected type of value");
    }
  }

  IsToNumberPure(realm: Realm, val: numberOrValue): boolean {
    if (val instanceof Value) {
      if (this.IsToPrimitivePure(realm, val)) {
        let type = val.getType();
        return type !== SymbolValue && type !== PrimitiveValue && type !== Value;
      }
      return false;
    }
    return true;
  }

  // ECMA262 7.1.1
  ToPrimitive(realm: Realm, input: ConcreteValue, hint?: "default" | "string" | "number"): PrimitiveValue {
    return this.ToPrimitiveOrAbstract(realm, input, hint).throwIfNotConcretePrimitive();
  }

  ToPrimitiveOrAbstract(
    realm: Realm,
    input: ConcreteValue,
    hint?: "default" | "string" | "number"
  ): AbstractValue | PrimitiveValue {
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
    return this.OrdinaryToPrimitiveOrAbstract(realm, input, hint);
  }

  // Returns result type of ToPrimitive if it is pure (terminates, does not throw exception, does not read or write heap), otherwise undefined.
  GetToPrimitivePureResultType(realm: Realm, input: Value): void | typeof Value {
    let type = input.getType();
    if (input instanceof PrimitiveValue) return type;
    if (input instanceof AbstractValue && !input.mightBeObject()) return PrimitiveValue;
    return undefined;
  }

  IsToPrimitivePure(realm: Realm, input: Value) {
    return this.GetToPrimitivePureResultType(realm, input) !== undefined;
  }

  // ECMA262 7.1.1
  OrdinaryToPrimitive(realm: Realm, input: ObjectValue, hint: "string" | "number"): PrimitiveValue {
    return this.OrdinaryToPrimitiveOrAbstract(realm, input, hint).throwIfNotConcretePrimitive();
  }

  OrdinaryToPrimitiveOrAbstract(
    realm: Realm,
    input: ObjectValue,
    hint: "string" | "number"
  ): AbstractValue | PrimitiveValue {
    let methodNames;

    // 1. Assert: Type(O) is Object.
    invariant(input instanceof ObjectValue, "Expected object");

    // 2. Assert: Type(hint) is String and its value is either "string" or "number".
    invariant(hint === "string" || hint === "number", "Expected string or number hint");

    // 3. If hint is "string", then
    if (hint === "string") {
      // a. Let methodNames be « "toString", "valueOf" ».
      methodNames = ["toString", "valueOf"];
    } else {
      // 4. Else,
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
        let resultType = result.getType();

        // ii. If Type(result) is not Object, return result.
        if (resultType === Value) {
          invariant(result instanceof AbstractValue);
          let error = new CompilerDiagnostic(
            `${name} might return either an object or primitive`,
            realm.currentLocation,
            "PP0028",
            "RecoverableError"
          );
          realm.handleError(error);
          throw new FatalError();
        }
        if (Value.isTypeCompatibleWith(resultType, PrimitiveValue)) {
          invariant(result instanceof AbstractValue || result instanceof PrimitiveValue);
          return result;
        }
      }
    }

    // 6. Throw a TypeError exception.
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "can't turn to primitive");
  }

  // ECMA262 7.1.12
  ToString(realm: Realm, val: string | ConcreteValue): string {
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
      let primValue = this.ToPrimitive(realm, val, "string");
      return this.ToString(realm, primValue);
    } else {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "unknown value type, can't coerce to string");
    }
  }

  IsToStringPure(realm: Realm, input: string | Value): boolean {
    if (input instanceof Value) {
      if (this.IsToPrimitivePure(realm, input)) {
        let type = input.getType();
        return type !== SymbolValue && type !== PrimitiveValue && type !== Value;
      }
    }
    return true;
  }

  ToStringPartial(realm: Realm, val: string | Value): string {
    return this.ToString(realm, typeof val === "string" ? val : val.throwIfNotConcrete());
  }

  ToStringValue(realm: Realm, val: Value): Value {
    if (val.getType() === StringValue) return val;
    if (val instanceof ObjectValue) {
      let primValue = this.ToPrimitiveOrAbstract(realm, val, "string");
      if (primValue.getType() === StringValue) return primValue;
      return this.ToStringValue(realm, primValue);
    } else if (val instanceof ConcreteValue) {
      let str = this.ToString(realm, val);
      return new StringValue(realm, str);
    } else if (val instanceof AbstractValue) {
      return this.ToStringAbstract(realm, val);
    } else {
      invariant(false, "unknown value type, can't coerce to string");
    }
  }

  ToStringAbstract(realm: Realm, value: AbstractValue): AbstractValue {
    if (value.mightNotBeString()) {
      let result;
      // If the property is not a string we need to coerce it.
      let coerceToString = createOperationDescriptor("COERCE_TO_STRING");
      if (value.mightBeObject() && !value.isSimpleObject()) {
        // If this might be a non-simple object, we need to coerce this at a
        // temporal point since it can have side-effects.
        // We can't rely on comparison to do it later, even if
        // it is non-strict comparison since we'll do multiple
        // comparisons. So we have to be explicit about when this
        // happens.
        result = realm.evaluateWithPossibleThrowCompletion(
          () => AbstractValue.createTemporalFromBuildFunction(realm, StringValue, [value], coerceToString),
          TypesDomain.topVal,
          ValuesDomain.topVal
        );
      } else {
        result = AbstractValue.createFromBuildFunction(realm, StringValue, [value], coerceToString);
      }
      invariant(result instanceof AbstractValue);
      return result;
    }
    return value;
  }

  // ECMA262 7.1.2
  ToBoolean(realm: Realm, val: ConcreteValue): boolean {
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
      throw realm.createErrorThrowCompletion(
        realm.intrinsics.TypeError,
        "unknown value type, can't coerce to a boolean"
      );
    }
  }

  ToBooleanPartial(realm: Realm, val: Value): boolean {
    if (!val.mightNotBeObject()) return true;
    return this.ToBoolean(realm, val.throwIfNotConcrete());
  }

  // ECMA262 7.1.14
  ToPropertyKey(realm: Realm, arg: ConcreteValue): SymbolValue | string /* but not StringValue */ {
    // 1. Let key be ? ToPrimitive(argument, hint String).
    let key = this.ToPrimitive(realm, arg, "string");

    // 2. If Type(key) is Symbol, then
    if (key instanceof SymbolValue) {
      // a. Return key.
      return key;
    }

    // 3. Return ! ToString(key).
    return this.ToString(realm, key);
  }

  ToPropertyKeyPartial(realm: Realm, arg: Value): AbstractValue | SymbolValue | string /* but not StringValue */ {
    if (arg instanceof ConcreteValue) return this.ToPropertyKey(realm, arg);
    // if we are in pure scope, we can assume that ToPropertyKey
    // won't cause side-effects even if it's not simple
    if (arg.mightNotBeString() && arg.mightNotBeNumber() && !arg.isSimpleObject() && !realm.isInPureScope()) {
      arg.throwIfNotConcrete();
    }
    invariant(arg instanceof AbstractValue);
    return arg;
  }

  // ECMA262 7.1.16
  CanonicalNumericIndexString(realm: Realm, argument: StringValue): number | void {
    // 1. Assert: Type(argument) is String.
    invariant(argument instanceof StringValue);

    // 2. If argument is "-0", return −0.
    if (argument.value === "-0") return -0;

    // 3. Let n be ToNumber(argument).
    let n = this.ToNumber(realm, argument);

    // 4. If SameValue(ToString(n), argument) is false, return undefined.
    if (SameValue(realm, new StringValue(realm, this.ToString(realm, new NumberValue(realm, n))), argument) === false)
      return undefined;

    // 5. Return n.
    return n;
  }
}
