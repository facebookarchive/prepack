/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { Realm } from "../realm.js";
import type { ResolvingFunctions, PromiseCapability, PromiseReaction } from "../types.js";
import { AbruptCompletion } from "../completions.js";
import {
  Value,
  ObjectValue,
  StringValue,
  NativeFunctionValue,
  FunctionValue,
  type UndefinedValue,
} from "../values/index.js";
import { SameValue } from "./abstract.js";
import { Construct } from "./construct.js";
import { Get } from "./get.js";
import { Invoke, Call } from "./call.js";
import { IsCallable, IsConstructor, IsPromise } from "./is.js";
import { IteratorStep, IteratorValue } from "./iterator.js";
import { Create, Properties } from "../singletons.js";
import invariant from "../invariant.js";

// ECMA262 8.4.1
export function EnqueueJob(realm: Realm, queueName: string, job: Function, args: Array<any>): void {}

// ECMA262 25.4.1.5
export function NewPromiseCapability(realm: Realm, C: Value): PromiseCapability {
  // 1. If IsConstructor(C) is false, throw a TypeError exception.
  if (IsConstructor(realm, C) === false) {
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "IsConstructor(C) is false");
  }
  invariant(C instanceof ObjectValue);

  // 2. NOTE C is assumed to be a constructor function that supports the parameter conventions of the Promise constructor (see 25.4.3.1).

  // 3. Let promiseCapability be a new PromiseCapability { [[Promise]]: undefined, [[Resolve]]: undefined, [[Reject]]: undefined }.
  let promiseCapability = {
    promise: realm.intrinsics.undefined,
    resolve: realm.intrinsics.undefined,
    reject: realm.intrinsics.undefined,
  };

  // 4. Let executor be a new built-in function object as defined in GetCapabilitiesExecutor Functions (25.4.1.5.1).
  let executor = new NativeFunctionValue(
    realm,
    undefined,
    undefined,
    2,
    (context, [resolve, reject]) => {
      // 1. Assert: F has a [[Capability]] internal slot whose value is a PromiseCapability Record.
      invariant(executor.$Capability, "F has a [[Capability]] internal slot whose value is a PromiseCapability Record");

      // 2. Let promiseCapability be the value of F's [[Capability]] internal slot.
      invariant(promiseCapability === executor.$Capability);

      // 3. If promiseCapability.[[Resolve]] is not undefined, throw a TypeError exception.
      if (!promiseCapability.resolve.mightBeUndefined()) {
        throw realm.createErrorThrowCompletion(
          realm.intrinsics.TypeError,
          "promiseCapability.[[Resolve]] is not undefined"
        );
      }
      promiseCapability.resolve.throwIfNotConcrete();

      // 4. If promiseCapability.[[Reject]] is not undefined, throw a TypeError exception.
      if (!promiseCapability.reject.mightBeUndefined()) {
        throw realm.createErrorThrowCompletion(
          realm.intrinsics.TypeError,
          "promiseCapability.[[Reject]] is not undefined"
        );
      }
      promiseCapability.reject.throwIfNotConcrete();

      // 5. Set promiseCapability.[[Resolve]] to resolve.
      promiseCapability.resolve = resolve;

      // 6. Set promiseCapability.[[Reject]] to reject.
      promiseCapability.reject = reject;

      // 7. Return undefined.
      return realm.intrinsics.undefined;
    },
    false
  );

  // 5. Set the [[Capability]] internal slot of executor to promiseCapability.
  executor.$Capability = promiseCapability;

  // 6. Let promise be ? Construct(C, « executor »).
  let promise = Construct(realm, C, [executor]).throwIfNotConcreteObject();

  // 7. If IsCallable(promiseCapability.[[Resolve]]) is false, throw a TypeError exception.
  if (IsCallable(realm, promiseCapability.resolve) === false) {
    throw realm.createErrorThrowCompletion(
      realm.intrinsics.TypeError,
      "IsCallable(promiseCapability.[[Resolve]]) is false"
    );
  }

  // 8. If IsCallable(promiseCapability.[[Reject]]) is false, throw a TypeError exception.
  if (IsCallable(realm, promiseCapability.reject) === false) {
    throw realm.createErrorThrowCompletion(
      realm.intrinsics.TypeError,
      "IsCallable(promiseCapability.[[Reject]]) is false"
    );
  }

  // 9. Set promiseCapability.[[Promise]] to promise.
  promiseCapability.promise = promise;

  // 10. Return promiseCapability.
  return promiseCapability;
}

// ECMA262 25.4.4.1.1j
function createResolveElementFunction(realm) {
  let resolveElement = new NativeFunctionValue(
    realm,
    undefined,
    undefined,
    1,
    (context, [x]) => {
      // 1. Let alreadyCalled be the value of F's [[AlreadyCalled]] internal slot.
      let alreadyCalled = resolveElement.$AlreadyCalled;
      invariant(alreadyCalled);

      // 2. If alreadyCalled.[[Value]] is true, return undefined.
      if (alreadyCalled.value === true) {
        return realm.intrinsics.undefined;
      }

      // 3. Set alreadyCalled.[[Value]] to true.
      alreadyCalled.value = true;

      // 4. Let index be the value of F's [[Index]] internal slot.
      let myIndex = resolveElement.$Index;
      invariant(typeof myIndex === "number");

      // 5. Let values be the value of F's [[Values]] internal slot.
      let values = resolveElement.$Values;
      invariant(values instanceof Array);

      // 6. Let promiseCapability be the value of F's [[Capabilities]] internal slot.
      let promiseCapability = resolveElement.$Capabilities;
      invariant(promiseCapability);

      // 7. Let remainingElementsCount be the value of F's [[RemainingElements]] internal slot.
      let remainingElementsCount = resolveElement.$RemainingElements;
      invariant(remainingElementsCount);

      // 8. Set values[index] to x.
      values[myIndex] = x;

      // 9. Set remainingElementsCount.[[Value]] to remainingElementsCount.[[Value]] - 1.
      remainingElementsCount.value = remainingElementsCount.value - 1;

      // 10. If remainingElementsCount.[[Value]] is 0, then
      if (remainingElementsCount.value === 0) {
        // a. Let valuesArray be CreateArrayFromList(values).
        let valuesArray = Create.CreateArrayFromList(realm, values);

        // b. Return ? Call(promiseCapability.[[Resolve]], undefined, « valuesArray »).
        Call(realm, promiseCapability.resolve, realm.intrinsics.undefined, [valuesArray]);
      }

      // 11. Return undefined.
      return realm.intrinsics.undefined;
    },
    false
  );
  return resolveElement;
}

// ECMA262 25.4.4.1.1
export function PerformPromiseAll(
  realm: Realm,
  iteratorRecord: { $Iterator: ObjectValue, $Done: boolean },
  constructor: FunctionValue,
  resultCapability: PromiseCapability
): Value {
  // 1. Assert: constructor is a constructor function.
  invariant(
    constructor instanceof FunctionValue && IsConstructor(realm, constructor),
    "constructor is a constructor function"
  );

  // 2. Assert: resultCapability is a PromiseCapability record.
  resultCapability;

  // 3. Let values be a new empty List.
  let values = [];

  // 4. Let remainingElementsCount be a new Record { [[Value]]: 1 }.
  let remainingElementsCount = { value: 1 };

  // 5. Let index be 0.
  let index = 0;

  // 6. Repeat
  while (true) {
    // a. Let next be IteratorStep(iteratorRecord.[[Iterator]]).
    let next;
    try {
      next = IteratorStep(realm, iteratorRecord.$Iterator);
    } catch (e) {
      if (e instanceof AbruptCompletion) {
        // b. If next is an abrupt completion, set iteratorRecord.[[Done]] to true.
        iteratorRecord.$Done = true;
      }

      // c. ReturnIfAbrupt(next).
      throw e;
    }

    // d. If next is false, then
    if (next === false) {
      // i. Set iteratorRecord.[[Done]] to true.
      iteratorRecord.$Done = true;

      // ii. Set remainingElementsCount.[[Value]] to remainingElementsCount.[[Value]] - 1.
      remainingElementsCount.value = remainingElementsCount.value - 1;

      // iii. If remainingElementsCount.[[Value]] is 0, then
      if (remainingElementsCount.value === 0) {
        // 1. Let valuesArray be CreateArrayFromList(values).
        let valuesArray = Create.CreateArrayFromList(realm, values);

        // 2. Perform ? Call(resultCapability.[[Resolve]], undefined, « valuesArray »).
        Call(realm, resultCapability.resolve, realm.intrinsics.undefined, [valuesArray]);
      }

      // iv. Return resultCapability.[[Promise]].
      return resultCapability.promise;
    }

    // e. Let nextValue be IteratorValue(next).
    let nextValue;
    try {
      nextValue = IteratorValue(realm, next);
    } catch (e) {
      if (e instanceof AbruptCompletion) {
        // f. If nextValue is an abrupt completion, set iteratorRecord.[[Done]] to true.
        iteratorRecord.$Done = true;
      }

      // g. ReturnIfAbrupt(nextValue).
      throw e;
    }

    // h. Append undefined to values.
    values.push(realm.intrinsics.undefined);

    // i. Let nextPromise be ? Invoke(constructor, "resolve", « nextValue »).
    let nextPromise = Invoke(realm, constructor, "resolve", [nextValue]);

    // j. Let resolveElement be a new built-in function object as defined in Promise.all Resolve Element Functions.
    let resolveElement = createResolveElementFunction(realm);

    // k. Set the [[AlreadyCalled]] internal slot of resolveElement to a new Record {[[Value]]: false }.
    resolveElement.$AlreadyCalled = { value: false };

    // l. Set the [[Index]] internal slot of resolveElement to index.
    resolveElement.$Index = index;

    // m. Set the [[Values]] internal slot of resolveElement to values.
    resolveElement.$Values = values;

    // n. Set the [[Capabilities]] internal slot of resolveElement to resultCapability.
    resolveElement.$Capabilities = resultCapability;

    // o. Set the [[RemainingElements]] internal slot of resolveElement to remainingElementsCount.
    resolveElement.$RemainingElements = remainingElementsCount;

    // p. Set remainingElementsCount.[[Value]] to remainingElementsCount.[[Value]] + 1.
    remainingElementsCount.value = remainingElementsCount.value + 1;

    // q. Perform ? Invoke(nextPromise, "then", « resolveElement, resultCapability.[[Reject]] »).
    Invoke(realm, nextPromise, "then", [resolveElement, resultCapability.reject]);

    // r. Set index to index + 1.
    index = index + 1;
  }
  invariant(false);
}

// ECMA262 25.4.4.3.1
export function PerformPromiseRace(
  realm: Realm,
  iteratorRecord: { $Iterator: ObjectValue, $Done: boolean },
  resultCapability: PromiseCapability,
  C: ObjectValue
): ObjectValue {
  // 1. Assert: constructor is a constructor function.
  invariant(IsConstructor(realm, C), "constructor is a constructor function");

  // 2. Assert: resultCapability is a PromiseCapability Record.
  resultCapability;

  // 3. Repeat
  while (true) {
    // a. Let next be IteratorStep(iteratorRecord.[[Iterator]]).
    let next;
    try {
      next = IteratorStep(realm, iteratorRecord.$Iterator);
    } catch (e) {
      if (e instanceof AbruptCompletion) {
        // b. If next is an abrupt completion, set iteratorRecord.[[Done]] to true.
        iteratorRecord.$Done = true;
      }

      // c. ReturnIfAbrupt(next).
      throw e;
    }

    // d. If next is false, then
    if (next === false) {
      // i. Set iteratorRecord.[[Done]] to true.
      iteratorRecord.$Done = true;

      // ii. Return resultCapability.[[Promise]].
      invariant(resultCapability.promise instanceof ObjectValue);
      return resultCapability.promise;
    }

    // e. Let nextValue be IteratorValue(next).
    let nextValue;
    try {
      nextValue = IteratorValue(realm, next);
    } catch (e) {
      if (e instanceof AbruptCompletion) {
        // f. If nextValue is an abrupt completion, set iteratorRecord.[[Done]] to true.
        iteratorRecord.$Done = true;
      }

      // g. ReturnIfAbrupt(nextValue).
      throw e;
    }

    // h. Let nextPromise be ? Invoke(C, "resolve", « nextValue »).
    let nextPromise = Invoke(realm, C, "resolve", [nextValue]);

    // i. Perform ? Invoke(nextPromise, "then", « resultCapability.[[Resolve]], resultCapability.[[Reject]] »).
    Invoke(realm, nextPromise, "then", [resultCapability.resolve, resultCapability.reject]);
  }
  invariant(false);
}

// ECMA262 25.4.5.3.1
export function PerformPromiseThen(
  realm: Realm,
  promise: ObjectValue,
  onFulfilled: Value,
  onRejected: Value,
  resultCapability: PromiseCapability
): ObjectValue {
  // 1. Assert: IsPromise(promise) is true.
  invariant(IsPromise(realm, promise), "IsPromise(promise) is true");

  // 2. Assert: resultCapability is a PromiseCapability record.
  resultCapability;

  // 3. If IsCallable(onFulfilled) is false, then
  if (IsCallable(realm, onFulfilled) === false) {
    // a. Let onFulfilled be "Identity".
    onFulfilled = new StringValue(realm, "Identity");
  }

  // 4. If IsCallable(onRejected) is false, then
  if (IsCallable(realm, onRejected)) {
    // a. Let onRejected be "Thrower".
    onRejected = new StringValue(realm, "Thrower");
  }

  // 5. Let fulfillReaction be the PromiseReaction { [[Capabilities]]: resultCapability, [[Handler]]: onFulfilled }.
  let fulfillReaction = { capabilities: resultCapability, handler: onFulfilled };

  // 6. Let rejectReaction be the PromiseReaction { [[Capabilities]]: resultCapability, [[Handler]]: onRejected}.
  let rejectReaction = { capabilities: resultCapability, handler: onRejected };

  // 7. If the value of promise's [[PromiseState]] internal slot is "pending", then
  if (promise.$PromiseState === "pending") {
    // a. Append fulfillReaction as the last element of the List that is the value of promise's [[PromiseFulfillReactions]] internal slot.
    Properties.ThrowIfInternalSlotNotWritable(realm, promise, "$PromiseFulfillReactions");
    invariant(promise.$PromiseFulfillReactions);
    promise.$PromiseFulfillReactions.push(fulfillReaction);
    // b. Append rejectReaction as the last element of the List that is the value of promise's [[PromiseRejectReactions]] internal slot.
    Properties.ThrowIfInternalSlotNotWritable(realm, promise, "$PromiseRejectReactions");
    invariant(promise.$PromiseRejectReactions);
    promise.$PromiseRejectReactions.push(rejectReaction);
  } else if (promise.$PromiseState === "fulfilled") {
    // 8. Else if the value of promise's [[PromiseState]] internal slot is "fulfilled", then
    // a. Let value be the value of promise's [[PromiseResult]] internal slot.
    let value = promise.$PromiseResult;
    // b. Perform EnqueueJob("PromiseJobs", PromiseReactionJob, « fulfillReaction, value »).
    EnqueueJob(realm, "PromiseJobs", PromiseReactionJob, [fulfillReaction, value]);
  } else {
    // 9. Else,
    // a. Assert: The value of promise's [[PromiseState]] internal slot is "rejected".
    invariant(promise.$PromiseState === "rejected");

    // b. Let reason be the value of promise's [[PromiseResult]] internal slot.
    let reason = promise.$PromiseResult;

    // c. If the value of promise's [[PromiseIsHandled]] internal slot is false, perform HostPromiseRejectionTracker(promise, "handle").
    if (promise.$PromiseIsHandled === false) HostPromiseRejectionTracker(realm, promise, "handle");

    // d. Perform EnqueueJob("PromiseJobs", PromiseReactionJob, « rejectReaction, reason »).
    EnqueueJob(realm, "PromiseJobs", PromiseReactionJob, [rejectReaction, reason]);
  }

  // 10. Set promise's [[PromiseIsHandled]] internal slot to true.
  Properties.ThrowIfInternalSlotNotWritable(realm, promise, "$PromiseIsHandled").$PromiseIsHandled = true;

  // 11. Return resultCapability.[[Promise]].
  invariant(resultCapability.promise instanceof ObjectValue);
  return resultCapability.promise;
}

// ECMA262 25.4.2.1
export function PromiseReactionJob(realm: Realm, reaction: Function, argument: Value): Value {
  return realm.intrinsics.undefined;
}

// ECMA262 25.4.1.3.2
function createResolveFunction(realm) {
  // 2. Let resolve be a new built-in function object as defined in Promise Resolve Functions (25.4.1.3.2).
  let resolve = new NativeFunctionValue(
    realm,
    undefined,
    undefined,
    1,
    (context, [resolution]) => {
      // 1. Assert: F has a [[Promise]] internal slot whose value is an Object.
      invariant(resolve.$Promise instanceof ObjectValue, "F has a [[Promise]] internal slot whose value is an Object");

      // 2. Let promise be the value of F's [[Promise]] internal slot.
      let promise = resolve.$Promise;

      // 3. Let alreadyResolved be the value of F's [[AlreadyResolved]] internal slot.
      let alreadyResolved = resolve.$AlreadyResolved;
      invariant(alreadyResolved !== undefined);

      // 4. If alreadyResolved.[[Value]] is true, return undefined.
      if (alreadyResolved.value === true) return realm.intrinsics.undefined;

      // 5. Set alreadyResolved.[[Value]] to true.
      alreadyResolved.value = true;

      // 6. If SameValue(resolution, promise) is true, then
      if (SameValue(realm, resolution.throwIfNotConcrete(), promise)) {
        // a. Let selfResolutionError be a newly created TypeError object.
        let selfResolutionError = Construct(realm, realm.intrinsics.TypeError, [new StringValue(realm, "resolve")]);

        // b. Return RejectPromise(promise, selfResolutionError).
        return RejectPromise(realm, promise, selfResolutionError);
      }
      // 7. If Type(resolution) is not Object, then
      if (!(resolution instanceof ObjectValue)) {
        // a. Return FulfillPromise(promise, resolution).
        return FulfillPromise(realm, promise, resolution);
      }

      // 8. Let then be Get(resolution, "then").
      let then;
      try {
        then = Get(realm, resolution, "then");
      } catch (e) {
        // 9. If then is an abrupt completion, then
        if (e instanceof AbruptCompletion) {
          // a. Return RejectPromise(promise, then.[[Value]]).
          return RejectPromise(realm, promise, e);
        } else throw e;
      }

      // 10. Let thenAction be then.[[Value]].
      let thenAction = then;

      // 11. If IsCallable(thenAction) is false, then
      if (IsCallable(realm, thenAction)) {
        // a. Return FulfillPromise(promise, resolution).
        return FulfillPromise(realm, promise, resolution);
      }

      // 12. Perform EnqueueJob("PromiseJobs", PromiseResolveThenableJob, « promise, resolution, thenAction »).
      EnqueueJob(realm, "PromiseJobs", PromiseResolveThenableJob, [promise, resolution, thenAction]);

      // 13. Return undefined.
      return realm.intrinsics.undefined;
    },
    false
  );
  return resolve;
}

// ECMA262 25.4.1.3.1
function createRejectFunction(realm) {
  // 5. Let reject be a new built-in function object as defined in Promise Reject Functions (25.4.1.3.1).
  let reject = new NativeFunctionValue(
    realm,
    undefined,
    undefined,
    1,
    (context, [reason]) => {
      // 1. Assert: F has a [[Promise]] internal slot whose value is an Object.
      invariant(reject.$Promise instanceof ObjectValue, "F has a [[Promise]] internal slot whose value is an Object");

      // 2. Let promise be the value of F's [[Promise]] internal slot.
      let promise = reject.$Promise;

      // 3. Let alreadyResolved be the value of F's [[AlreadyResolved]] internal slot.
      let alreadyResolved = reject.$AlreadyResolved;
      invariant(alreadyResolved !== undefined);

      // 4. If alreadyResolved.[[Value]] is true, return undefined.
      if (alreadyResolved.value === true) return realm.intrinsics.undefined;

      // 5. Set alreadyResolved.[[Value]] to true.
      alreadyResolved.value = true;

      // 6. Return RejectPromise(promise, reason).
      return RejectPromise(realm, promise, reason);
    },
    false
  );
  return reject;
}

// ECMA262 25.4.1.3
export function CreateResolvingFunctions(realm: Realm, promise: ObjectValue): ResolvingFunctions {
  // 1. Let alreadyResolved be a new Record { [[Value]]: false }.
  let alreadyResolved = { value: false };

  // 2. Let resolve be a new built-in function object as defined in Promise Resolve Functions (25.4.1.3.2).
  let resolve = createResolveFunction(realm);

  // 3. Set the [[Promise]] internal slot of resolve to promise.
  resolve.$Promise = promise;

  // 4. Set the [[AlreadyResolved]] internal slot of resolve to alreadyResolved.
  resolve.$AlreadyResolved = alreadyResolved;

  // 5. Let reject be a new built-in function object as defined in Promise Reject Functions (25.4.1.3.1).
  let reject = createRejectFunction(realm);

  // 6. Set the [[Promise]] internal slot of reject to promise.
  reject.$Promise = promise;

  // 7. Set the [[AlreadyResolved]] internal slot of reject to alreadyResolved.
  reject.$AlreadyResolved = alreadyResolved;

  // 8. Return a new Record { [[Resolve]]: resolve, [[Reject]]: reject }.
  return { resolve: resolve, reject: reject };
}

// ECMA262 25.4.1.4
export function FulfillPromise(realm: Realm, promise: ObjectValue, value: Value): Value {
  // 1. Assert: The value of promise.[[PromiseState]] is "pending".
  invariant(promise.$PromiseState === "pending");

  // 2. Let reactions be promise.[[PromiseFulfillReactions]].
  let reactions = promise.$PromiseFulfillReactions;
  invariant(reactions);

  // 3. Set promise.[[PromiseResult]] to value.
  Properties.ThrowIfInternalSlotNotWritable(realm, promise, "$PromiseResult").$PromiseResult = value;

  // 4. Set promise.[[PromiseFulfillReactions]] to undefined.
  Properties.ThrowIfInternalSlotNotWritable(
    realm,
    promise,
    "$PromiseFulfillReactions"
  ).$PromiseFulfillReactions = undefined;

  // 5. Set promise.[[PromiseRejectReactions]] to undefined.
  Properties.ThrowIfInternalSlotNotWritable(
    realm,
    promise,
    "$PromiseRejectReactions"
  ).$PromiseRejectReactions = undefined;

  // 6. Set promise.[[PromiseState]] to "fulfilled".
  Properties.ThrowIfInternalSlotNotWritable(realm, promise, "$PromiseState").$PromiseState = "fulfilled";

  // 7. Return TriggerPromiseReactions(reactions, value).
  return TriggerPromiseReactions(realm, reactions, value);
}

// ECMA262 25.4.1.7
export function RejectPromise(realm: Realm, promise: ObjectValue, reason: Value): Value {
  // 1. Assert: The value of promise.[[PromiseState]] is "pending".
  invariant(promise.$PromiseState === "pending");

  // 2. Let reactions be promise.[[PromiseRejectReactions]].
  let reactions = promise.$PromiseFulfillReactions;
  invariant(reactions);

  // 3. Set promise.[[PromiseResult]] to reason.
  Properties.ThrowIfInternalSlotNotWritable(realm, promise, "$PromiseResult").$PromiseResult = reason;

  // 4. Set promise.[[PromiseFulfillReactions]] to undefined.
  Properties.ThrowIfInternalSlotNotWritable(
    realm,
    promise,
    "$PromiseFulfillReactions"
  ).$PromiseFulfillReactions = undefined;

  // 5. Set promise.[[PromiseRejectReactions]] to undefined.
  Properties.ThrowIfInternalSlotNotWritable(
    realm,
    promise,
    "$PromiseRejectReactions"
  ).$PromiseRejectReactions = undefined;

  // 6. Set promise.[[PromiseState]] to "rejected".
  Properties.ThrowIfInternalSlotNotWritable(realm, promise, "$PromiseState").$PromiseState = "rejected";

  // 7. If promise.[[PromiseIsHandled]] is false, perform HostPromiseRejectionTracker(promise, "reject").
  if (promise.$PromiseIsHandled === false) HostPromiseRejectionTracker(realm, promise, "reject");

  // 8. Return TriggerPromiseReactions(reactions, reason).
  return TriggerPromiseReactions(realm, reactions, reason);
}

// ECMA262 25.4.1.8
export function TriggerPromiseReactions(
  realm: Realm,
  reactions: Array<PromiseReaction>,
  argument: Value
): UndefinedValue {
  // 1. Repeat for each reaction in reactions, in original insertion order
  for (let reaction of reactions) {
    // a. Perform EnqueueJob("PromiseJobs", PromiseReactionJob, « reaction, argument »).
    EnqueueJob(realm, "PromiseJobs", PromiseReactionJob, [reaction, argument]);
  }
  // 2. Return undefined.
  return realm.intrinsics.undefined;
}

// ECMA262 25.4.1.9
export function HostPromiseRejectionTracker(realm: Realm, promise: ObjectValue, operation: "reject" | "handle"): void {}

// ECMA262 25.4.2.2
export function PromiseResolveThenableJob(
  realm: Realm,
  promiseToResolve: ObjectValue,
  thenable: Value,
  then: Value
): void {}
