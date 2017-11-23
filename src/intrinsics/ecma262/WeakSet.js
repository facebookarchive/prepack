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
import { NativeFunctionValue, NullValue, UndefinedValue } from "../../values/index.js";
import { AbruptCompletion } from "../../completions.js";
import { Get, IsCallable, IteratorClose, IteratorValue, GetIterator, IteratorStep, Call } from "../../methods/index.js";
import { Create } from "../../singletons.js";
import invariant from "../../invariant.js";

export default function(realm: Realm): NativeFunctionValue {
  // ECMA262 23.4.1.1
  let func = new NativeFunctionValue(realm, "WeakSet", "WeakSet", 0, (args, [iterable], argCount, NewTarget) => {
    // 1. If NewTarget is undefined, throw a TypeError exception.
    if (!NewTarget) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 2. Let set be ? OrdinaryCreateFromConstructor(NewTarget, "%WeakSetPrototype%", « [[WeakSetData]] »).
    let set = Create.OrdinaryCreateFromConstructor(realm, NewTarget, "WeakSetPrototype", {
      $WeakSetData: undefined,
    });

    // 3. Set set.[[WeakSetData]] to a new empty List.
    set.$WeakSetData = [];

    // 4. If iterable is not present, let iterable be undefined.
    if (iterable === undefined) iterable = realm.intrinsics.undefined;

    let iter, adder;
    // 5. If iterable is either undefined or null, let iter be undefined.
    if ((iterable: any) instanceof UndefinedValue || (iterable: any) instanceof NullValue) {
      iter = realm.intrinsics.undefined;
      adder = realm.intrinsics.undefined;
    } else {
      // 6. Else,
      // a. Let adder be ? Get(set, "add").
      adder = Get(realm, set, "add");

      // b. If IsCallable(adder) is false, throw a TypeError exception.
      if (!IsCallable(realm, adder)) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "IsCallable(adder) is false");
      }

      // c. Let iter be ? GetIterator(iterable).
      iter = GetIterator(realm, iterable);
    }
    // 7. If iter is undefined, return set.
    if (iter instanceof UndefinedValue) return set;

    // 8. Repeat
    while (true) {
      // a. Let next be ? IteratorStep(iter).
      let next = IteratorStep(realm, iter);

      // b. If next is false, return set.
      if (next === false) return set;

      // c. Let nextValue be ? IteratorValue(next).
      let nextValue = IteratorValue(realm, next);

      // d. Let status be Call(adder, set, « nextValue »).
      try {
        Call(realm, adder, set, [nextValue]);
      } catch (statusCompletion) {
        if (!(statusCompletion instanceof AbruptCompletion)) throw statusCompletion;
        // e. If status is an abrupt completion, return ? IteratorClose(iter, status).
        throw IteratorClose(realm, iter, statusCompletion);
      }
    }

    invariant(false);
  });

  return func;
}
