/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import type { Realm } from "../../realm.js";
import { NativeFunctionValue, NumberValue } from "../../values/index.js";
import { Create, To } from "../../singletons.js";

export default function(realm: Realm): NativeFunctionValue {
  // ECMA262 20.1.1
  let func = new NativeFunctionValue(realm, "Number", "Number", 1, (context, [value], argCount, NewTarget) => {
    let n;

    // 1. If no arguments were passed to this function invocation, let n be +0.
    if (argCount === 0) {
      n = realm.intrinsics.zero;
    } else {
      // 2. Else, let n be ? ToNumber(value).
      n = new NumberValue(realm, To.ToNumber(realm, value));
    }

    // 3. If NewTarget is undefined, return n.
    if (!NewTarget) return n;

    // 4. Let O be ? OrdinaryCreateFromConstructor(NewTarget, "%NumberPrototype%", « [[NumberData]] »).
    let O = Create.OrdinaryCreateFromConstructor(realm, NewTarget, "NumberPrototype", { $NumberData: undefined });

    // 5. Set the value of O's [[NumberData]] internal slot to n.
    O.$NumberData = n;

    // 6. Return O.
    return O;
  });

  // ECMA262 20.1.2.1
  func.defineNativeConstant("EPSILON", new NumberValue(realm, 2.220446049250313e-16));

  // ECMA262 20.1.2.2
  if (!realm.isCompatibleWith(realm.MOBILE_JSC_VERSION) && !realm.isCompatibleWith("mobile"))
    func.defineNativeMethod("isFinite", 1, (context, [_number]) => {
      let number = _number;
      // 1. If Type(number) is not Number, return false.
      if (!number.mightBeNumber()) return realm.intrinsics.false;

      // 2. If number is NaN, +∞, or -∞, return false.
      number = number.throwIfNotConcreteNumber();
      if (isNaN(number.value) || number.value === +Infinity || number.value === -Infinity)
        return realm.intrinsics.false;

      // 3. Otherwise, return true.
      return realm.intrinsics.true;
    });

  // ECMA262 20.1.2.3
  if (!realm.isCompatibleWith(realm.MOBILE_JSC_VERSION) && !realm.isCompatibleWith("mobile"))
    func.defineNativeMethod("isInteger", 1, (context, [_number]) => {
      let number = _number;
      // 1. If Type(number) is not Number, return false.
      if (!number.mightBeNumber()) return realm.intrinsics.false;

      // 2. If number is NaN, +∞, or -∞, return false.
      number = number.throwIfNotConcreteNumber();
      if (isNaN(number.value) || number.value === +Infinity || number.value === -Infinity)
        return realm.intrinsics.false;

      // 3. Let integer be ToInteger(number).
      let integer = To.ToInteger(realm, number);

      // 4. If integer is not equal to number, return false.
      if (integer !== number.value) return realm.intrinsics.false;

      // 5. Otherwise, return true.
      return realm.intrinsics.true;
    });

  // ECMA262 20.1.2.4
  if (!realm.isCompatibleWith(realm.MOBILE_JSC_VERSION) && !realm.isCompatibleWith("mobile"))
    func.defineNativeMethod("isNaN", 1, (context, [_number]) => {
      let number = _number;
      // 1. If Type(number) is not Number, return false.
      if (!number.mightBeNumber()) return realm.intrinsics.false;

      // 2. If number is NaN, return true.
      number = number.throwIfNotConcreteNumber();
      if (isNaN(number.value)) return realm.intrinsics.true;

      // 3. Otherwise, return false.
      return realm.intrinsics.false;
    });

  // ECMA262 20.1.2.5
  if (!realm.isCompatibleWith(realm.MOBILE_JSC_VERSION) && !realm.isCompatibleWith("mobile"))
    func.defineNativeMethod("isSafeInteger", 1, (context, [_number]) => {
      let number = _number;
      // 1. If Type(number) is not Number, return false.
      if (!number.mightBeNumber()) return realm.intrinsics.false;

      // 2. If number is NaN, +∞, or -∞, return false.
      number = number.throwIfNotConcreteNumber();
      if (isNaN(number.value) || number.value === +Infinity || number.value === -Infinity)
        return realm.intrinsics.false;

      // 3. Let integer be ToInteger(number).
      let integer = To.ToInteger(realm, number);

      // 4. If integer is not equal to number, return false.
      if (integer !== number.value) return realm.intrinsics.false;

      // 5. If abs(integer) ≤ 2^53-1, return true.
      if (Math.abs(integer) <= Math.pow(2, 53) - 1) return realm.intrinsics.true;

      // 6. Otherwise, return false.
      return realm.intrinsics.false;
    });

  // ECMA262 20.1.2.6
  if (!realm.isCompatibleWith(realm.MOBILE_JSC_VERSION))
    func.defineNativeConstant("MAX_SAFE_INTEGER", new NumberValue(realm, 9007199254740991));

  // ECMA262 20.1.2.7
  func.defineNativeConstant("MAX_VALUE", new NumberValue(realm, 1.7976931348623157e308));

  // ECMA262 20.1.2.8
  if (!realm.isCompatibleWith(realm.MOBILE_JSC_VERSION))
    func.defineNativeConstant("MIN_SAFE_INTEGER", new NumberValue(realm, -9007199254740991));

  // ECMA262 20.1.2.9
  func.defineNativeConstant("MIN_VALUE", new NumberValue(realm, 5e-324));

  // ECMA262 20.1.2.10
  func.defineNativeConstant("NaN", realm.intrinsics.NaN);

  // ECMA262 20.1.2.11
  func.defineNativeConstant("NEGATIVE_INFINITY", realm.intrinsics.negativeInfinity);

  // ECMA262 20.1.2.12
  func.defineNativeProperty("parseFloat", realm.intrinsics.parseFloat);

  // ECMA262 20.1.2.13
  func.defineNativeProperty("parseInt", realm.intrinsics.parseInt);

  // ECMA262 20.1.2.14
  func.defineNativeConstant("POSITIVE_INFINITY", realm.intrinsics.Infinity);

  return func;
}
