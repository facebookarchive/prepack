/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { Realm } from "../../realm.js";
import { ObjectValue, StringValue, UndefinedValue } from "../../values/index.js";
import { ThrowCompletion } from "../../completions.js";
import { Construct, ToInteger, ToString, thisNumberValue } from "../../methods/index.js";
import { TypesDomain, ValuesDomain } from "../../domains/index.js";
import invariant from "../../invariant.js";
import buildExpressionTemplate from "../../utils/builder.js";

let buildToLocaleString = buildExpressionTemplate("(VALUE).toLocaleString()");

export default function (realm: Realm, obj: ObjectValue): void {
  // ECMA262 20.1.3
  obj.$NumberData = realm.intrinsics.zero;

  // ECMA262 20.1.3.2
  obj.defineNativeMethod("toExponential", 1, (context, [fractionDigits]) => {
    // 1. Let x be ? thisNumberValue(this value).
    let x = thisNumberValue(realm, context).value;

    // 2. Let f be ? ToInteger(fractionDigits).
    fractionDigits = fractionDigits.throwIfNotConcrete();
    let f = ToInteger(realm, fractionDigits);

    // 3. Assert: f is 0, when fractionDigits is undefined.
    invariant(f === 0 || !(fractionDigits instanceof UndefinedValue));

    // 4. If x is NaN, return the String "NaN".
    if (isNaN(x)) return new StringValue(realm, "NaN");

    // 5. Let s be the empty String.
    let s = "";

    // 6. If x < 0, then
    if (x < 0) {
      // 6a. Let s be "-".
      s = "-";

      // 6b. Let x be -x.
      x = -x;
    }

    // 7. If x = +∞, then
    if (x === +Infinity) {
      // 7a. Return the concatenation of the Strings s and "Infinity".
      return new StringValue(realm, s + "Infinity");
    }

    // 8. If f < 0 or f > 20, throw a RangeError exception. However, an implementation is permitted to extend the behaviour of toExponential for values of f less than 0 or greater than 20. In this case toExponential would not necessarily throw RangeError for such values.
    if (f < 0 || f > 20) {
      throw new ThrowCompletion(
        Construct(realm, realm.intrinsics.RangeError, [new StringValue(realm, "f < 0 || f > 20")])
      );
    }

    let positiveResultString = x.toExponential(fractionDigits instanceof UndefinedValue ? undefined : f);
    return new StringValue(realm, s + positiveResultString);
  });

  // ECMA262 20.1.3.3
  obj.defineNativeMethod("toFixed", 1, (context, [fractionDigits]) => {
    // 1. Let f be ToInteger(fractionDigits). (If fractionDigits is undefined, this step produces the value 0).
    let f = ToInteger(realm, fractionDigits);

    // 2. If f < 0 or f > 20, throw a RangeError exception.
    if (f < 0 || f > 20) {
      throw new ThrowCompletion(
        Construct(realm, realm.intrinsics.RangeError, [new StringValue(realm, "f < 0 || f > 20")]));
    }

    // 3. Let x be this Number value.
    let x = thisNumberValue(realm, context).value;

    // 4. If x is NaN, return the String "NaN".
    if (isNaN(x)) return new StringValue(realm, "NaN");

    return new StringValue(realm, x.toFixed(f));
  });

  // ECMA262 20.1.3.4
  obj.defineNativeMethod("toLocaleString", 0, (context) => {
    let x = thisNumberValue(realm, context);
    if (realm.isPartial) {
      // The locale is environment-dependent
      return realm.deriveAbstract(new TypesDomain(StringValue), ValuesDomain.topVal, [x], ([n]) => buildToLocaleString({
        VALUE: n
      }));
    } else {
      return new StringValue(realm, x.toLocaleString());
    }
  });

  // ECMA262 20.1.3.5
  obj.defineNativeMethod("toPrecision", 1, (context, [precision]) => {
    // 1. Let x be ? thisNumberValue(this value).
    let num = thisNumberValue(realm, context);
    // 2. If precision is undefined, return ! ToString(x).
    if (precision instanceof UndefinedValue) {
      return new StringValue(realm, ToString(realm, num));
    }
    // 3. Let p be ? ToInteger(precision).
    let p = ToInteger(realm, precision.throwIfNotConcrete());
    // 4. If x is NaN, return the String "NaN".
    let x = num.value;
    if (isNaN(x)) {
      return new StringValue(realm, "NaN");
    }
    // 5. Let s be the empty String.
    let s = "";
    // 6. If x < 0, then
    if (x < 0) {
      // a. Let s be code unit 0x002D (HYPHEN-MINUS).
      s = "-";
      // b. Let x be -x.
      x = -x;
    }
    // 7. If x = +∞, then
    if (x === +Infinity) {
      // a. Return the String that is the concatenation of s and "Infinity".
      return new StringValue(realm, s + "Infinity");
    }
    // 8. If p < 1 or p > 21, throw a RangeError exception.
    // However, an implementation is permitted to extend the behaviour of
    // toPrecision for values of p less than 1 or greater than 21.
    // In this case toPrecision would not necessarily throw RangeError for such
    // values.
    if (p < 1 || p > 21) {
      // for simplicity, throw the error
      throw new ThrowCompletion(
        Construct(realm, realm.intrinsics.RangeError,
          [new StringValue(realm, "p should be in between 1 and 21 inclusive")]));
    }
    return new StringValue(realm, s + x.toPrecision(p));
  });

  // ECMA262 20.1.3.6
  obj.defineNativeMethod("toString", 1, (context, [radix]) => {
    // 1. Let x be ? thisNumberValue(this value).
    let x = thisNumberValue(realm, context);

    // 2. If radix is not present, let radixNumber be 10.
    // 3. Else if radix is undefined, let radixNumber be 10.
    let radixNumber;
    if (!radix || radix instanceof UndefinedValue) {
      radixNumber = 10;
    } else { // 4. Else let radixNumber be ? ToInteger(radix).
      radixNumber = ToInteger(realm, radix.throwIfNotConcrete());
    }

    // 5. If radixNumber < 2 or radixNumber > 36, throw a RangeError exception.
    if (radixNumber < 2 || radixNumber > 36) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 6. If radixNumber = 10, return ! ToString(x).
    if (radixNumber === 10) return new StringValue(realm, ToString(realm, x));

    // 7. Return the String representation of this Number value using the radix specified by radixNumber.
    //    Letters a-z are used for digits with values 10 through 35. The precise algorithm is
    //    implementation-dependent, however the algorithm should be a generalization of that specified in
    //    7.1.12.1.
    return new StringValue(realm, x.value.toString(radixNumber));
  });

  // ECMA262 20.1.3.7
  obj.defineNativeMethod("valueOf", 0, (context) => {
    // 1. Return ? thisNumberValue(this value).
    return thisNumberValue(realm, context);
  });
}
