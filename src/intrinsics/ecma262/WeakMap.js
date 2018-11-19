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
import { NativeFunctionValue, ObjectValue, NullValue, UndefinedValue } from "../../values/index.js";
import { AbruptCompletion } from "../../completions.js";
import { Get, IsCallable, IteratorClose, IteratorValue, GetIterator, IteratorStep, Call } from "../../methods/index.js";
import { Create } from "../../singletons.js";
import invariant from "../../invariant.js";

export default function(realm: Realm): NativeFunctionValue {
  let func = new NativeFunctionValue(realm, "WeakMap", "WeakMap", 0, (args, [iterable], argCount, NewTarget) => {
    // 1. If NewTarget is undefined, throw a TypeError exception.
    if (!NewTarget) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 2. Let map be ? OrdinaryCreateFromConstructor(NewTarget, "%WeakMapPrototype%", « [[WeakMapData]] »).
    let map = Create.OrdinaryCreateFromConstructor(realm, NewTarget, "WeakMapPrototype", {
      $WeakMapData: undefined,
    });

    // 3. Set map's [[WeakMapData]] internal slot to a new empty List.
    map.$WeakMapData = [];

    // 4. If iterable is not present, let iterable be undefined.
    if (iterable && realm.isCompatibleWith(realm.MOBILE_JSC_VERSION)) {
      throw realm.createErrorThrowCompletion(
        realm.intrinsics.TypeError,
        "the weak map constructor doesn't take arguments"
      );
    }
    if (!iterable) iterable = realm.intrinsics.undefined;

    // 5. If iterable is either undefined or null, let iter be undefined.
    let iter, adder;
    if ((iterable: any) instanceof UndefinedValue || (iterable: any) instanceof NullValue) {
      adder = realm.intrinsics.undefined;
      iter = realm.intrinsics.undefined;
    } else {
      // 6. Else,
      // a. Let adder be ? Get(map, "set").
      adder = Get(realm, map, "set");

      // b. If IsCallable(adder) is false, throw a TypeError exception.
      if (!IsCallable(realm, adder)) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
      }

      // c. Let iter be ? GetIterator(iterable).
      iter = GetIterator(realm, iterable);
    }

    // 7. If iter is undefined, return map.
    if (iter instanceof UndefinedValue) {
      return map;
    }

    // 8. Repeat
    while (true) {
      // a. Let next be ? IteratorStep(iter).
      let next = IteratorStep(realm, iter);

      // b. If next is false, return map.
      if (!next) return map;

      // c. Let nextItem be ? IteratorValue(next).
      let nextItem = IteratorValue(realm, next).throwIfNotConcrete();

      // d. If Type(nextItem) is not Object, then
      if (!(nextItem instanceof ObjectValue)) {
        // i. Let error be Completion{[[Type]]: throw, [[Value]]: a newly created TypeError object, [[Target]]: empty}.
        let error = realm.createErrorThrowCompletion(realm.intrinsics.TypeError);

        // ii. Return ? IteratorClose(iter, error).
        throw IteratorClose(realm, iter, error);
      }

      // e. Let k be Get(nextItem, "0").
      let k;
      try {
        k = Get(realm, nextItem, "0");
      } catch (kCompletion) {
        if (kCompletion instanceof AbruptCompletion) {
          // f. If k is an abrupt completion, return ? IteratorClose(iter, k).
          throw IteratorClose(realm, iter, kCompletion);
        } else throw kCompletion;
      }

      // g. Let v be Get(nextItem, "1").
      let v;
      try {
        v = Get(realm, nextItem, "1");
      } catch (vCompletion) {
        if (vCompletion instanceof AbruptCompletion) {
          // h. If v is an abrupt completion, return ? IteratorClose(iter, v).
          throw IteratorClose(realm, iter, vCompletion);
        } else throw vCompletion;
      }

      // i. Let status be Call(adder, map, « k.[[Value]], v.[[Value]] »).
      let status;
      try {
        status = Call(realm, adder, map, [k, v]);
      } catch (statusCompletion) {
        if (statusCompletion instanceof AbruptCompletion) {
          // j. If status is an abrupt completion, return ? IteratorClose(iter, status).
          throw IteratorClose(realm, iter, statusCompletion);
        } else throw statusCompletion;
      }
      status;
    }

    invariant(false);
  });

  return func;
}
