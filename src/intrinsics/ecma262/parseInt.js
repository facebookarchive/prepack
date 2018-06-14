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
import { NativeFunctionValue } from "../../values/index.js";
import { NumberValue } from "../../values/index.js";
import { To } from "../../singletons.js";

function ToDigit(ch: string): number | void {
  if (ch >= "0" && ch <= "9") {
    return ch.charCodeAt(0) - "0".charCodeAt(0);
  } else if (ch >= "A" && ch <= "Z") {
    return 10 + ch.charCodeAt(0) - "A".charCodeAt(0);
  } else if (ch >= "a" && ch <= "z") {
    return 10 + ch.charCodeAt(0) - "a".charCodeAt(0);
  }
  return undefined;
}

export default function(realm: Realm): NativeFunctionValue {
  return new NativeFunctionValue(
    realm,
    "parseInt",
    "parseInt",
    2,
    (context, [string, radix]) => {
      // 1. Let inputString be ? ToString(string).
      let inputString = To.ToStringPartial(realm, string);

      // 2. Let S be a newly created substring of inputString consisting of the first code unit that is not a StrWhiteSpaceChar and all code units following that code unit. (In other words, remove leading white space.) If inputString does not contain any such code unit, let S be the empty string.
      let S = inputString.trim();

      // 3. Let sign be 1.
      let sign = 1;

      // 4. If S is not empty and the first code unit of S is 0x002D (HYPHEN-MINUS), let sign be -1.
      if (S !== "" && S.charAt(0) === "-") sign = -1;

      // 5. If S is not empty and the first code unit of S is 0x002B (PLUS SIGN) or 0x002D (HYPHEN-MINUS), remove the first code unit from S.
      if (S !== "" && (S.charAt(0) === "-" || S.charAt(0) === "+")) S = S.substr(1);

      // 6. Let R be ? ToInt32(radix).
      let R = To.ToInt32(realm, radix);

      // 7. Let stripPrefix be true.
      let stripPrefix = true;

      // 8. If R ≠ 0, then
      if (R !== 0) {
        // a. If R < 2 or R > 36, return NaN.
        if (R < 2 || R > 36) return realm.intrinsics.NaN;

        // b .If R ≠ 16, let stripPrefix be false.
        if (R !== 16) stripPrefix = false;
      } else {
        // 9. Else R = 0,
        // a. Let R be 10.
        R = 10;
      }

      // 10. If stripPrefix is true, then
      if (stripPrefix === true) {
        // a. If the length of S is at least 2 and the first two code units of S are either "0x" or "0X", remove the first two code units from S and let R be 16.
        if (S.length >= 2 && S.charAt(0) === "0" && (S.charAt(1) === "x" || S.charAt(1) === "X")) {
          S = S.substr(2);
          R = 16;
        }
      }

      // 11. If S contains a code unit that is not a radix-R digit, let Z be the substring of S consisting of all code units before the first such code unit; otherwise, let Z be S.
      let Z = "";
      for (let i = 0; i < S.length; ++i) {
        let digit = ToDigit(S.charAt(i));
        if (digit === undefined || digit >= R) {
          break;
        }
        Z = Z + S.charAt(i);
      }

      // 12. If Z is empty, return NaN.
      if (Z === "") return realm.intrinsics.NaN;

      // 13. Let mathInt be the mathematical integer value that is represented by Z in radix-R notation, using the letters A-Z and a-z for digits with values 10 through 35. (However, if R is 10 and Z contains more than 20 significant digits, every significant digit after the 20th may be replaced by a 0 digit, at the option of the implementation; and if R is not 2, 4, 8, 10, 16, or 32, then mathInt may be an implementation-dependent approximation to the mathematical integer value that is represented by Z in radix-R notation.)
      let mathInt = 0;
      for (let i = 0; i < Z.length; ++i) {
        mathInt = mathInt * R + (ToDigit(Z.charAt(i)) || 0);
      }

      // 14. If mathInt = 0, then
      if (mathInt === 0) {
        // a. If sign = -1, return -0.
        if (sign === -1) return realm.intrinsics.negativeZero;
        // b. Return +0.
        return realm.intrinsics.zero;
      }

      // 15. Let number be the Number value for mathInt.
      let number = Number(mathInt);

      // 5. Return sign × number.
      return new NumberValue(realm, sign * number);
    },
    false
  );
}
