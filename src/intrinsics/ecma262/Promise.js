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
import { ObjectValue, FunctionValue, NativeFunctionValue } from "../../values/index.js";
import { AbruptCompletion } from "../../completions.js";
import {
  NewPromiseCapability,
  PerformPromiseAll,
  PerformPromiseRace,
  CreateResolvingFunctions,
} from "../../methods/promise.js";
import { IsCallable, Call, GetIterator, SameValuePartial, Get, IsPromise } from "../../methods/index.js";
import { IteratorClose } from "../../methods/iterator.js";
import { Create } from "../../singletons.js";
import invariant from "../../invariant.js";

export default function(realm: Realm): NativeFunctionValue {
  // ECMA262 25.4.3.1
  let func = new NativeFunctionValue(realm, "Promise", "Promise", 1, (context, [executor], argCount, NewTarget) => {
    // 1. If NewTarget is undefined, throw a TypeError exception.
    if (!NewTarget) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 2. If IsCallable(executor) is false, throw a TypeError exception.
    if (!IsCallable(realm, executor)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 3. Let promise be ? OrdinaryCreateFromConstructor(NewTarget, "%PromisePrototype%", « [[PromiseState]], [[PromiseResult]], [[PromiseFulfillReactions]], [[PromiseRejectReactions]], [[PromiseIsHandled]] »).
    let promise = Create.OrdinaryCreateFromConstructor(realm, NewTarget, "PromisePrototype", {
      $PromiseState: undefined,
      $PromiseResult: undefined,
      $PromiseFulfillReactions: undefined,
      $PromiseRejectReactions: undefined,
      $PromiseIsHandled: undefined,
    });

    // 4. Set promise's [[PromiseState]] internal slot to "pending".
    promise.$PromiseState = "pending";

    // 5. Set promise's [[PromiseFulfillReactions]] internal slot to a new empty List.
    promise.$PromiseFulfillReactions = [];

    // 6. Set promise's [[PromiseRejectReactions]] internal slot to a new empty List.
    promise.$PromiseRejectReactions = [];

    // 7. Set promise's [[PromiseIsHandled]] internal slot to false.
    promise.$PromiseIsHandled = false;

    // 8. Let resolvingFunctions be CreateResolvingFunctions(promise).
    let resolvingFunctions = CreateResolvingFunctions(realm, promise);

    // 9. Let completion be Call(executor, undefined, « resolvingFunctions.[[Resolve]], resolvingFunctions.[[Reject]] »).
    let completion;
    try {
      completion = Call(realm, executor, realm.intrinsics.undefined, [
        resolvingFunctions.resolve,
        resolvingFunctions.reject,
      ]);
    } catch (err) {
      if (err instanceof AbruptCompletion) {
        completion = err;
      } else {
        throw err;
      }
    }

    // 10. If completion is an abrupt completion, then
    if (completion instanceof AbruptCompletion) {
      // a. Perform ? Call(resolvingFunctions.[[Reject]], undefined, « completion.[[Value]] »).
      Call(realm, resolvingFunctions.reject, realm.intrinsics.undefined, [completion.value]);
    }

    // 11. Return promise.
    return promise;
  });

  // ECMA262 25.4.4.1
  func.defineNativeMethod("all", 1, (context, [iterable]) => {
    // 1. Let C be the this value.
    let C = context.throwIfNotConcrete();

    // 2. If Type(C) is not Object, throw a TypeError exception.
    if (!(C instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 3. Let promiseCapability be ? NewPromiseCapability(C).
    let promiseCapability = NewPromiseCapability(realm, C);

    // 4. Let iterator be GetIterator(iterable).
    let iterator;
    try {
      iterator = GetIterator(realm, iterable);
    } catch (e) {
      if (e instanceof AbruptCompletion) {
        // 5. IfAbruptRejectPromise(iterator, promiseCapability).
        Call(realm, promiseCapability.reject, realm.intrinsics.undefined, [e.value]);
        return promiseCapability.promise;
      } else throw e;
    }

    // 6. Let iteratorRecord be Record {[[Iterator]]: iterator, [[Done]]: false}.
    let iteratorRecord = { $Iterator: iterator, $Done: false };

    // 7. Let result be PerformPromiseAll(iteratorRecord, C, promiseCapability).
    let result;
    try {
      invariant(C instanceof FunctionValue);
      result = PerformPromiseAll(realm, iteratorRecord, C, promiseCapability);
    } catch (e) {
      // 8. If result is an abrupt completion, then
      if (e instanceof AbruptCompletion) {
        // a. If iteratorRecord.[[Done]] is false, let result be IteratorClose(iterator, result).
        if (iteratorRecord.$Done === false) {
          try {
            result = IteratorClose(realm, iterator, e).value;
          } catch (resultCompletion) {
            if (resultCompletion instanceof AbruptCompletion) {
              result = resultCompletion.value;
            } else throw resultCompletion;
          }
        } else {
          result = e.value;
        }

        // b. IfAbruptRejectPromise(result, promiseCapability).
        Call(realm, promiseCapability.reject, realm.intrinsics.undefined, [result]);
        return promiseCapability.promise;
      } else throw e;
    }

    // 9. Return Completion(result).
    return result;
  });

  // ECMA262 25.4.4.3
  func.defineNativeMethod("race", 1, (context, [iterable]) => {
    // 1. Let C be the this value.
    let C = context.throwIfNotConcrete();

    // 2. If Type(C) is not Object, throw a TypeError exception.
    if (!(C instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 3. Let promiseCapability be ? NewPromiseCapability(C).
    let promiseCapability = NewPromiseCapability(realm, C);

    // 4. Let iterator be GetIterator(iterable).
    let iterator;
    try {
      iterator = GetIterator(realm, iterable);
    } catch (e) {
      if (e instanceof AbruptCompletion) {
        // 5. IfAbruptRejectPromise(iterator, promiseCapability).
        Call(realm, promiseCapability.reject, realm.intrinsics.undefined, [e.value]);
        return promiseCapability.promise;
      } else throw e;
    }

    // 6. Let iteratorRecord be Record {[[Iterator]]: iterator, [[Done]]: false}.
    let iteratorRecord = { $Iterator: iterator, $Done: false };

    // 7. Let result be PerformPromiseRace(iteratorRecord, promiseCapability, C).
    let result;
    try {
      result = PerformPromiseRace(realm, iteratorRecord, promiseCapability, C);
    } catch (e) {
      // 8. If result is an abrupt completion, then
      if (e instanceof AbruptCompletion) {
        // a. If iteratorRecord.[[Done]] is false, let result be IteratorClose(iterator, result).
        if (iteratorRecord.$Done === false) {
          try {
            result = IteratorClose(realm, iterator, e).value;
          } catch (resultCompletion) {
            if (resultCompletion instanceof AbruptCompletion) {
              result = resultCompletion.value;
            } else throw resultCompletion;
          }
        } else {
          result = e.value;
        }

        // b. IfAbruptRejectPromise(result, promiseCapability).
        Call(realm, promiseCapability.reject, realm.intrinsics.undefined, [result]);
        return promiseCapability.promise;
      } else throw e;
    }

    // 9. Return Completion(result).
    return result;
  });

  // ECMA262 25.4.4.4
  func.defineNativeMethod("reject", 1, (context, [r]) => {
    // 1. Let C be the this value.
    let C = context.throwIfNotConcrete();

    // 2. If Type(C) is not Object, throw a TypeError exception.
    if (!(C instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 3. Let promiseCapability be ? NewPromiseCapability(C).
    let promiseCapability = NewPromiseCapability(realm, C);

    // 4. Perform ? Call(promiseCapability.[[Reject]], undefined, « r »).
    Call(realm, promiseCapability.reject, realm.intrinsics.undefined, [r]);

    // 5. Return promiseCapability.[[Promise]].
    return promiseCapability.promise;
  });

  // ECMA262 25.4.4.5
  func.defineNativeMethod("resolve", 1, (context, [x]) => {
    // 1. Let C be the this value.
    let C = context.throwIfNotConcrete();

    // 2. If Type(C) is not Object, throw a TypeError exception.
    if (!(C instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 3. If IsPromise(x) is true, then
    if (IsPromise(realm, x)) {
      invariant(x instanceof ObjectValue);
      // a. Let xConstructor be ? Get(x, "constructor").
      let xConstructor = Get(realm, x, "constructor");

      // b. If SameValue(xConstructor, C) is true, return x.
      if (SameValuePartial(realm, xConstructor, C)) return x;
    }

    // 4. Let promiseCapability be ? NewPromiseCapability(C).
    let promiseCapability = NewPromiseCapability(realm, C);

    // 5. Perform ? Call(promiseCapability.[[Resolve]], undefined, « x »).
    Call(realm, promiseCapability.resolve, realm.intrinsics.undefined, [x]);

    // 6. Return promiseCapability.[[Promise]].
    return promiseCapability.promise;
  });

  // ECMA262 25.4.4.6
  func.defineNativeGetter(realm.intrinsics.SymbolSpecies, context => {
    // 1. Return the this value
    return context;
  });

  return func;
}
