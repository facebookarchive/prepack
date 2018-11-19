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
import { Create } from "../../singletons.js";
import { ObjectValue, StringValue } from "../../values/index.js";
import invariant from "../../invariant.js";

export default function(realm: Realm, obj: ObjectValue): void {
  // ECMA262 21.1.5.2.1
  obj.defineNativeMethod("next", 0, context => {
    // 1. Let O be the this value.
    let O = context.throwIfNotConcrete();

    // 2. If Type(O) is not Object, throw a TypeError exception.
    if (!(O instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Type(O) is not Object");
    }

    // 3. If O does not have all of the internal slots of an String Iterator Instance (21.1.5.3), throw a TypeError exception.
    if (!("$IteratedString" in O && "$StringIteratorNextIndex" in O)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Type(O) is not Object");
    }

    // 4. Let s be O.[[IteratedString]].
    let s = O.$IteratedString;

    // 5. If s is undefined, return CreateIterResultObject(undefined, true).
    if (!s) {
      return Create.CreateIterResultObject(realm, realm.intrinsics.undefined, true);
    }

    // 6. Let position be O.[[StringIteratorNextIndex]].
    let position = O.$StringIteratorNextIndex;
    invariant(typeof position === "number");

    // 7. Let len be the number of elements in s.
    let len = s.value.length;

    // 8. If position ≥ len, then
    if (position >= len) {
      // a. Set O.[[IteratedString]] to undefined.
      O.$IteratedString = undefined;

      // b. Return CreateIterResultObject(undefined, true).
      return Create.CreateIterResultObject(realm, realm.intrinsics.undefined, true);
    }

    // 9. Let first be the code unit value at index position in s.
    let first = s.value.charCodeAt(position);

    let resultString;
    // 10. If first < 0xD800 or first > 0xDBFF or position+1 = len, let resultString be the string consisting of the single code unit first.
    if (first < 0xd800 || first > 0xdbff || position + 1 === len) {
      resultString = String.fromCharCode(first);
    } else {
      // 11. Else,
      // a. Let second be the code unit value at index position+1 in the String s.
      let second = s.value.charCodeAt(position + 1);

      // b. If second < 0xDC00 or second > 0xDFFF, let resultString be the string consisting of the single code unit first.
      if (second < 0xdc00 || second > 0xdfff) {
        resultString = String.fromCharCode(first);
      } else {
        // c. Else, let resultString be the string consisting of the code unit first followed by the code unit second.
        resultString = String.fromCharCode(first, second);
      }
    }
    // 12. Let resultSize be the number of code units in resultString.
    let resultSize = resultString.length;

    // 13. Set O.[[StringIteratorNextIndex]] to position + resultSize.
    O.$StringIteratorNextIndex = position + resultSize;

    // 14. Return CreateIterResultObject(resultString, false).
    return Create.CreateIterResultObject(realm, new StringValue(realm, resultString), false);
  });

  // ECMA262 21.1.5.2.2
  obj.defineNativeProperty(realm.intrinsics.SymbolToStringTag, new StringValue(realm, "String Iterator"), {
    writable: false,
  });
}
