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
import { StringValue, NativeFunctionValue, UndefinedValue, ObjectValue } from "../../values/index.js";
import { IsRegExp } from "../../methods/is.js";
import { Get } from "../../methods/get.js";
import { SameValuePartial } from "../../methods/abstract.js";
import { RegExpAlloc, RegExpInitialize } from "../../methods/regexp.js";
import invariant from "../../invariant.js";

export default function(realm: Realm): NativeFunctionValue {
  let func = new NativeFunctionValue(realm, "RegExp", "RegExp", 2, (context, [pattern, flags], argCount, NewTarget) => {
    // 1. Let patternIsRegExp be ? IsRegExp(pattern).
    let patternIsRegExp = IsRegExp(realm, pattern);
    let newTarget;
    // 2. If NewTarget is not undefined, let newTarget be NewTarget.
    if (NewTarget) {
      newTarget = NewTarget;
    } else {
      // 3. Else,
      // a. Let newTarget be the active function object.
      newTarget = func;

      // b. If patternIsRegExp is true and flags is undefined, then
      if (patternIsRegExp && flags instanceof UndefinedValue) {
        invariant(pattern instanceof ObjectValue);
        // i. Let patternConstructor be ? Get(pattern, "constructor").
        let patternConstructor = Get(realm, pattern, "constructor");

        // ii. If SameValue(newTarget, patternConstructor) is true, return pattern.
        if (SameValuePartial(realm, newTarget, patternConstructor)) {
          return pattern;
        }
      }
    }

    let P, F;
    // 4. If Type(pattern) is Object and pattern has a [[RegExpMatcher]] internal slot, then
    if (pattern instanceof ObjectValue && pattern.$RegExpMatcher) {
      // a. Let P be the value of pattern's [[OriginalSource]] internal slot.
      invariant(typeof pattern.$OriginalSource === "string");
      P = new StringValue(realm, pattern.$OriginalSource);

      // b. If flags is undefined, let F be the value of pattern's [[OriginalFlags]] internal slot.
      if (flags instanceof UndefinedValue) {
        invariant(typeof pattern.$OriginalFlags === "string");
        F = new StringValue(realm, pattern.$OriginalFlags);
      } else {
        // c. Else, let F be flags.
        F = flags.throwIfNotConcrete();
      }
    } else if (patternIsRegExp) {
      // 5. Else if patternIsRegExp is true, then
      invariant(pattern instanceof ObjectValue);
      // a. Let P be ? Get(pattern, "source").
      P = Get(realm, pattern, "source");

      // b. If flags is undefined, then
      if (flags instanceof UndefinedValue) {
        // i. Let F be ? Get(pattern, "flags").
        F = Get(realm, pattern, "flags");
      } else {
        // c. Else, let F be flags.
        F = flags.throwIfNotConcrete();
      }
    } else {
      // 6. Else,
      // a. Let P be pattern.
      P = pattern.throwIfNotConcrete();
      // b. Let F be flags.
      F = flags.throwIfNotConcrete();
    }

    // 7. Let O be ? RegExpAlloc(newTarget).
    let O = RegExpAlloc(realm, newTarget);

    // 8. Return ? RegExpInitialize(O, P, F).
    return RegExpInitialize(realm, O, P, F);
  });

  // ECMA262 21.2.4.2
  func.defineNativeGetter(realm.intrinsics.SymbolSpecies, context => {
    // 1. Return the this value
    return context;
  });

  return func;
}
