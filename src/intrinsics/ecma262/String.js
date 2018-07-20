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
import { NativeFunctionValue, NumberValue, StringValue, SymbolValue, Value } from "../../values/index.js";
import { Get, GetPrototypeFromConstructor, SymbolDescriptiveString } from "../../methods/index.js";
import { Create, To } from "../../singletons.js";
import invariant from "../../invariant.js";

export default function(realm: Realm): NativeFunctionValue {
  // ECMA262 21.1.1
  let func = new NativeFunctionValue(realm, "String", "String", 1, (context, [value], argCount, NewTarget) => {
    let s: ?Value;

    // 1. If no arguments were passed to this function invocation, let s be "".
    if (argCount === 0) {
      s = realm.intrinsics.emptyString;
    } else {
      // 2. Else,
      // a. If NewTarget is undefined and Type(value) is Symbol, return SymbolDescriptiveString(value).
      if (!NewTarget && value instanceof SymbolValue) {
        return new StringValue(realm, SymbolDescriptiveString(realm, value));
      }

      // b. Let s be ? ToString(value).
      s = To.ToStringValue(realm, value);
    }

    // 3. If NewTarget is undefined, return s.
    if (!NewTarget) return s;

    // 4. Return ? StringCreate(s, ? GetPrototypeFromConstructor(NewTarget, "%StringPrototype%")).
    s = s.throwIfNotConcreteString();
    return Create.StringCreate(realm, s, GetPrototypeFromConstructor(realm, NewTarget, "StringPrototype"));
  });

  // ECMA262 21.1.2.1 ( ..._codeUnits_ )
  func.defineNativeMethod("fromCharCode", 1, (context, codeUnits, argCount) => {
    // 1. Let codeUnits be a List containing the arguments passed to this function.
    codeUnits;

    // 2. Let length be the number of elements in codeUnits.
    let length = argCount;

    // 3. Let elements be a new empty List.
    let elements = [];

    // 4. Let nextIndex be 0.
    let nextIndex = 0;

    // 5. Repeat while nextIndex < length
    while (nextIndex < length) {
      // a. Let next be codeUnits[nextIndex].
      let next = codeUnits[nextIndex];

      // b. Let nextCU be ? ToUint16(next).
      let nextCU = To.ToUint16(realm, next);

      // c. Append nextCU to the end of elements.
      elements.push(nextCU);

      // d. Let nextIndex be nextIndex + 1.
      nextIndex++;
    }
    // 6. Return the String value whose elements are, in order, the elements in the List elements. If length
    //    is 0, the empty string is returned.
    return new StringValue(realm, String.fromCharCode.apply(null, elements));
  });

  // ECMA262 21.1.2.2 ( ..._codePoints_ )
  if (!realm.isCompatibleWith(realm.MOBILE_JSC_VERSION) && !realm.isCompatibleWith("mobile"))
    func.defineNativeMethod("fromCodePoint", 1, (context, codePoints, argCount) => {
      // 1. Let codePoints be a List containing the arguments passed to this function.
      codePoints;

      // 2. Let length be the number of elements in codePoints.
      let length = argCount;

      // 3. Let elements be a new empty List.
      let elements = [];

      // 4. Let nextIndex be 0.
      let nextIndex = 0;

      // 5. Repeat while nextIndex < length
      while (nextIndex < length) {
        // a. Let next be codePoints[nextIndex].
        let next = codePoints[nextIndex];

        // b. Let nextCP be ? ToNumber(next).
        let nextCP = To.ToNumber(realm, next);

        // c. If SameValue(nextCP, ToInteger(nextCP)) is false, throw a RangeError exception.
        if (nextCP !== To.ToInteger(realm, nextCP)) {
          throw realm.createErrorThrowCompletion(
            realm.intrinsics.RangeError,
            "SameValue(nextCP, To.ToInteger(nextCP)) is false"
          );
        }

        // d. If nextCP < 0 or nextCP > 0x10FFFF, throw a RangeError exception.
        if (nextCP < 0 || nextCP > 0x10ffff) {
          throw realm.createErrorThrowCompletion(
            realm.intrinsics.RangeError,
            "SameValue(nextCP, To.ToInteger(nextCP)) is false"
          );
        }

        // e. Append the elements of the UTF16Encoding of nextCP to the end of elements.
        elements.push(String.fromCodePoint(nextCP));

        // f. Let nextIndex be nextIndex + 1.
        nextIndex++;
      }

      // 6. Return the String value whose elements are, in order, the elements in the List elements. If length
      //    is 0, the empty string is returned.
      return new StringValue(realm, elements.join(""));
    });

  // ECMA262 21.1.2.4
  if (!realm.isCompatibleWith(realm.MOBILE_JSC_VERSION) && !realm.isCompatibleWith("mobile"))
    func.defineNativeMethod("raw", 1, (context, [template, ..._substitutions], argCount) => {
      let substitutions = _substitutions;
      // 1. Let substitutions be a List consisting of all of the arguments passed to this function, starting with the second argument. If fewer than two arguments were passed, the List is empty.
      substitutions = argCount < 2 ? [] : substitutions;

      // 2. Let numberOfSubstitutions be the number of elements in substitutions.
      let numberOfSubstitutions = substitutions.length;

      // 3. Let cooked be ? ToObject(template).
      let cooked = To.ToObject(realm, template);

      // 4. Let raw be ? ToObject(? Get(cooked, "raw")).
      let raw = To.ToObject(realm, Get(realm, cooked, "raw"));

      // 5. Let literalSegments be ? ToLength(? Get(raw, "length")).
      let literalSegments = To.ToLength(realm, Get(realm, raw, "length"));

      // 6. If literalSegments ≤ 0, return the empty string.
      if (literalSegments <= 0) return realm.intrinsics.emptyString;

      // 7. Let stringElements be a new empty List.
      let stringElements = "";

      // 8. Let nextIndex be 0.
      let nextIndex = 0;

      // 9. Repeat
      while (true) {
        // a. Let nextKey be ! ToString(nextIndex).
        let nextKey = To.ToString(realm, new NumberValue(realm, nextIndex));

        // b. Let nextSeg be ? ToString(? Get(raw, nextKey)).
        let nextSeg = To.ToStringPartial(realm, Get(realm, raw, nextKey));

        // c. Append in order the code unit elements of nextSeg to the end of stringElements.
        stringElements = stringElements + nextSeg;

        // d. If nextIndex + 1 = literalSegments, then
        if (nextIndex + 1 === literalSegments) {
          // i. Return the String value whose code units are, in order, the elements in the List stringElements. If stringElements has no elements, the empty string is returned.
          return new StringValue(realm, stringElements);
        }

        let next;
        // e. If nextIndex < numberOfSubstitutions, let next be substitutions[nextIndex].
        if (nextIndex < numberOfSubstitutions) next = substitutions[nextIndex];
        else {
          // f. Else, let next be the empty String.
          next = realm.intrinsics.emptyString;
        }
        // g. Let nextSub be ? ToString(next).
        let nextSub = To.ToStringPartial(realm, next);

        // h. Append in order the code unit elements of nextSub to the end of stringElements.
        stringElements = stringElements + nextSub;

        // i. Let nextIndex be nextIndex + 1.
        nextIndex = nextIndex + 1;
      }
      invariant(false);
    });

  return func;
}
