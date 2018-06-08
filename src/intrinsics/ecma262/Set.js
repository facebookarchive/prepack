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
import { NativeFunctionValue, NullValue, UndefinedValue } from "../../values/index.js";
import { AbruptCompletion } from "../../completions.js";
import {
  IsCallable,
  Call,
  GetIterator,
  IteratorStep,
  IteratorValue,
  IteratorClose,
  Get,
  HasSomeCompatibleType,
} from "../../methods/index.js";
import { Create } from "../../singletons.js";
import invariant from "../../invariant.js";
import { CompilerDiagnostic } from "../../errors.js";

export default function(realm: Realm): NativeFunctionValue {
  // ECMA262 23.2.1.1
  let func = new NativeFunctionValue(realm, "Set", "Set", 0, (context, [_iterable], argCount, NewTarget) => {
    let iterable = _iterable;
    // 1. If NewTarget is undefined, throw a TypeError exception.
    if (!NewTarget) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 2. Let set be ? OrdinaryCreateFromConstructor(NewTarget, "%SetPrototype%", « [[SetData]] »).
    let set = Create.OrdinaryCreateFromConstructor(realm, NewTarget, "SetPrototype", {
      $SetData: undefined,
    });

    // 3. Set set's [[SetData]] internal slot to a new empty List.
    set.$SetData = [];

    // 4. If iterable is not present, let iterable be undefined.
    if (iterable && realm.isCompatibleWith(realm.MOBILE_JSC_VERSION)) {
      let loc = realm.currentLocation;
      let error = new CompilerDiagnostic(
        "This version of JSC ignores the argument to Set, require the polyfill before doing this",
        loc,
        "PP0001",
        "RecoverableError"
      );
      realm.handleError(error);
    }
    if (!iterable) iterable = realm.intrinsics.undefined;

    // 5. If iterable is either undefined or null, let iter be undefined.
    let iter, adder;
    if (HasSomeCompatibleType(iterable, UndefinedValue, NullValue)) {
      adder = realm.intrinsics.undefined;
      iter = realm.intrinsics.undefined;
    } else {
      // 6. Else,
      // a. Let adder be ? Get(set, "add").
      adder = Get(realm, set, "add");

      // b. If IsCallable(adder) is false, throw a TypeError exception.
      if (!IsCallable(realm, adder)) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
      }

      // c. Let iter be ? GetIterator(iterable).
      iter = GetIterator(realm, iterable);
    }

    // 7. If iter is undefined, return set.
    if (iter instanceof UndefinedValue) {
      return set;
    }

    // 8. Repeat
    while (true) {
      // a. Let next be ? IteratorStep(iter).
      let next = IteratorStep(realm, iter);

      // b. If next is false, return set.
      if (!next) return set;

      // c. Let nextValue be ? IteratorValue(next).
      let nextValue = IteratorValue(realm, next);

      // d. Let status be Call(adder, set, « nextValue.[[Value]] »).
      try {
        Call(realm, adder, set, [nextValue]);
      } catch (status) {
        if (status instanceof AbruptCompletion) {
          // e. If status is an abrupt completion, return ? IteratorClose(iter, status).
          throw IteratorClose(realm, iter, status);
        } else throw status;
      }
    }

    invariant(false);
  });

  // ECMA262 23.2.2.2
  func.defineNativeGetter(realm.intrinsics.SymbolSpecies, context => {
    // 1. Return the this value
    return context;
  });

  return func;
}
