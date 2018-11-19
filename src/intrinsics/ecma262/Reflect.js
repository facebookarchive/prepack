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
import { BooleanValue, ObjectValue, NullValue } from "../../values/index.js";
import { Call, Construct, IsCallable, IsConstructor } from "../../methods/index.js";
import { Create, Properties, To } from "../../singletons.js";

export default function(realm: Realm): ObjectValue {
  let obj = new ObjectValue(realm, realm.intrinsics.ObjectPrototype, "Reflect");

  // ECMA262 26.1.1
  obj.defineNativeMethod("apply", 3, (context, [target, thisArgument, argumentsList]) => {
    // 1. If IsCallable(target) is false, throw a TypeError exception.
    if (!IsCallable(realm, target)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 2. Let args be ? CreateListFromArrayLike(argumentsList).
    let args = Create.CreateListFromArrayLike(realm, argumentsList);

    // TODO #1008 3. Perform PrepareForTailCall().

    // 4. Return ? Call(target, thisArgument, args).
    return Call(realm, target, thisArgument, args);
  });

  // ECMA262 26.1.2
  obj.defineNativeMethod("construct", 2, (context, [target, argumentsList, _newTarget]) => {
    let newTarget = _newTarget;
    // 1. If IsConstructor(target) is false, throw a TypeError exception.
    if (!IsConstructor(realm, target)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 2. If newTarget is not present, let newTarget be target.
    if (!newTarget) {
      newTarget = target;
    } else if (!IsConstructor(realm, newTarget)) {
      // 3. Else if IsConstructor(newTarget) is false, throw a TypeError exception.
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 4. Let args be ? CreateListFromArrayLike(argumentsList).
    let args = Create.CreateListFromArrayLike(realm, argumentsList);

    // 5. Return ? Construct(target, args, newTarget).
    return Construct(realm, target, args, newTarget);
  });

  // ECMA262 26.1.3
  obj.defineNativeMethod("defineProperty", 3, (context, [_target, propertyKey, attributes]) => {
    let target = _target.throwIfNotConcrete();

    // 1. If Type(target) is not Object, throw a TypeError exception.
    if (!(target instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 2. Let key be ? ToPropertyKey(propertyKey).
    let key = To.ToPropertyKey(realm, propertyKey);

    // 3. Let desc be ? ToPropertyDescriptor(attributes).
    let desc = To.ToPropertyDescriptor(realm, attributes);

    // 4. Return ? target.[[DefineOwnProperty]](key, desc).
    return new BooleanValue(realm, target.$DefineOwnProperty(key, desc));
  });

  // ECMA262 26.1.4
  obj.defineNativeMethod("deleteProperty", 2, (context, [_target, propertyKey]) => {
    let target = _target.throwIfNotConcrete();

    // 1. If Type(target) is not Object, throw a TypeError exception.
    if (!(target instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 2. Let key be ? ToPropertyKey(propertyKey).
    let key = To.ToPropertyKey(realm, propertyKey);

    // 3. Return ? target.[[Delete]](key).
    return new BooleanValue(realm, target.$Delete(key));
  });

  // ECMA262 26.1.5
  obj.defineNativeMethod("get", 2, (context, [_target, propertyKey, _receiver]) => {
    let receiver = _receiver;
    let target = _target.throwIfNotConcrete();

    // 1. If Type(target) is not Object, throw a TypeError exception.
    if (!(target instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 2. Let key be ? ToPropertyKey(propertyKey).
    let key = To.ToPropertyKey(realm, propertyKey);

    // 3. If receiver is not present, then
    if (!receiver) {
      // a. Let receiver be target.
      receiver = target;
    }

    // 4. Return ? target.[[Get]](key, receiver).
    return target.$Get(key, receiver);
  });

  // ECMA262 26.1.6
  obj.defineNativeMethod("getOwnPropertyDescriptor", 2, (context, [_target, propertyKey]) => {
    let target = _target.throwIfNotConcrete();

    // 1. If Type(target) is not Object, throw a TypeError exception.
    if (!(target instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 2. Let key be ? ToPropertyKey(propertyKey).
    let key = To.ToPropertyKey(realm, propertyKey);

    // 3. Let desc be ? target.[[GetOwnProperty]](key).
    let desc = target.$GetOwnProperty(key);

    // 4. Return FromPropertyDescriptor(desc).
    return Properties.FromPropertyDescriptor(realm, desc);
  });

  // ECMA262 26.1.7
  obj.defineNativeMethod("getPrototypeOf", 1, (context, [_target]) => {
    let target = _target.throwIfNotConcrete();

    // 1. If Type(target) is not Object, throw a TypeError exception.
    if (!(target instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 2. Return ? target.[[GetPrototypeOf]]().
    return target.$GetPrototypeOf();
  });

  // ECMA262 26.1.8
  obj.defineNativeMethod("has", 2, (context, [target, propertyKey]) => {
    // 1. If Type(target) is not Object, throw a TypeError exception.
    if (target.mightNotBeObject()) {
      if (target.mightBeObject()) target.throwIfNotConcrete();
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 2. Let key be ? ToPropertyKey(propertyKey).
    let key = To.ToPropertyKey(realm, propertyKey);

    // 3. Return ? target.[[HasProperty]](key).
    return new BooleanValue(realm, target.$HasProperty(key));
  });

  // ECMA262 26.1.9
  obj.defineNativeMethod("isExtensible", 1, (context, [_target]) => {
    let target = _target.throwIfNotConcrete();

    // 1. If Type(target) is not Object, throw a TypeError exception.
    if (!(target instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 2. Return ? target.[[IsExtensible]]().
    return new BooleanValue(realm, target.$IsExtensible());
  });

  // ECMA262 26.1.10
  obj.defineNativeMethod("ownKeys", 1, (context, [_target]) => {
    let target = _target.throwIfNotConcrete();

    // 1. If Type(target) is not Object, throw a TypeError exception.
    if (!(target instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 2. Let keys be ? target.[[OwnPropertyKeys]]().
    let keys = target.$OwnPropertyKeys();

    // 3. Return CreateArrayFromList(keys).
    return Create.CreateArrayFromList(realm, keys);
  });

  // ECMA262 26.1.11
  obj.defineNativeMethod("preventExtensions", 1, (context, [_target]) => {
    let target = _target.throwIfNotConcrete();

    // 1. If Type(target) is not Object, throw a TypeError exception.
    if (!(target instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 2. Return ? target.[[PreventExtensions]]().
    return new BooleanValue(realm, target.$PreventExtensions());
  });

  // ECMA262 26.1.12
  obj.defineNativeMethod("set", 3, (context, [_target, propertyKey, V, _receiver]) => {
    let receiver = _receiver;
    let target = _target.throwIfNotConcrete();

    // 1. If Type(target) is not Object, throw a TypeError exception.
    if (!(target instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 2. Let key be ? ToPropertyKey(propertyKey).
    let key = To.ToPropertyKey(realm, propertyKey);

    // 3. If receiver is not present, then
    if (!receiver) {
      // a. Let receiver be target.
      receiver = target;
    }

    // 5. Return ? target.[[Set]](key, V, receiver).
    return new BooleanValue(realm, target.$Set(key, V, receiver));
  });

  // ECMA262 26.1.13
  obj.defineNativeMethod("setPrototypeOf", 2, (context, [_target, _proto]) => {
    let target = _target.throwIfNotConcrete();
    let proto = _proto.throwIfNotConcrete();

    // 1. If Type(target) is not Object, throw a TypeError exception.
    if (!(target instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 2. If Type(proto) is not Object and proto is not null, throw a TypeError exception.
    if (!(proto instanceof ObjectValue) && !(proto instanceof NullValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 3. Return ? target.[[SetPrototypeOf]](proto).
    return new BooleanValue(realm, target.$SetPrototypeOf(proto));
  });

  return obj;
}
