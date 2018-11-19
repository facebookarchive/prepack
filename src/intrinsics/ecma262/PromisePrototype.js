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
import { StringValue, ObjectValue } from "../../values/index.js";
import { IsPromise, Invoke, SpeciesConstructor } from "../../methods/index.js";
import { NewPromiseCapability, PerformPromiseThen } from "../../methods/promise.js";
import invariant from "../../invariant.js";

export default function(realm: Realm, obj: ObjectValue): void {
  // ECMA262 25.4.5.1
  obj.defineNativeMethod("catch", 1, (context, [onRejected]) => {
    // 1. Let promise be the this value.
    let promise = context;

    // 2. Return ? Invoke(promise, "then", « undefined, onRejected »).
    return Invoke(realm, promise, "then", [realm.intrinsics.undefined, onRejected]);
  });

  // ECMA262 25.4.5.3
  obj.defineNativeMethod("then", 2, (context, [onFulfilled, onRejected]) => {
    // 1. Let promise be the this value.
    let promise = context;

    // 2. If IsPromise(promise) is false, throw a TypeError exception.
    if (!IsPromise(realm, promise)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }
    invariant(promise instanceof ObjectValue);

    // 3. Let C be ? SpeciesConstructor(promise, %Promise%).
    let C = SpeciesConstructor(realm, promise, realm.intrinsics.Promise);

    // 4. Let resultCapability be ? NewPromiseCapability(C).
    let resultCapability = NewPromiseCapability(realm, C);

    // 5. Return PerformPromiseThen(promise, onFulfilled, onRejected, resultCapability).
    return PerformPromiseThen(realm, promise, onFulfilled, onRejected, resultCapability);
  });

  // ECMA262 25.4.5.4 Promise.prototype [ @@toStringTag ]
  obj.defineNativeProperty(realm.intrinsics.SymbolToStringTag, new StringValue(realm, "Promise"), { writable: false });
}
