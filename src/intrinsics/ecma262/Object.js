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
import { NativeFunctionValue } from "../../values/index.js";
import { AbstractValue, ObjectValue, NullValue, UndefinedValue, StringValue, BooleanValue, SymbolValue } from "../../values/index.js";
import {
  ToObject,
  ToObjectPartial,
  ToPropertyKey,
  ToPropertyDescriptor,
  IsExtensible,
  EnumerableOwnProperties,
  GetOwnPropertyKeys,
  Get,
  CreateArrayFromList,
  CreateDataProperty,
  ObjectCreate,
  OrdinaryCreateFromConstructor,
  RequireObjectCoercible,
  SameValuePartial,
  Set,
  ObjectDefineProperties,
  DefinePropertyOrThrow,
  FromPropertyDescriptor,
  TestIntegrityLevel,
  SetIntegrityLevel,
  HasSomeCompatibleType,
  ThrowIfMightHaveBeenDeleted,
} from "../../methods/index.js";
import invariant from "../../invariant.js";

export default function (realm: Realm): NativeFunctionValue {
  // ECMA262 19.1.1.1
  let func = new NativeFunctionValue(realm, "Object", "Object", 1, (context, [value], argCount, NewTarget) => {
    // 1. If NewTarget is neither undefined nor the active function, then
    if (NewTarget && NewTarget !== func) {
      // a. Return ? OrdinaryCreateFromConstructor(NewTarget, "%ObjectPrototype%").
      return OrdinaryCreateFromConstructor(realm, NewTarget, "ObjectPrototype");
    }

    // 2. If value is null, undefined or not supplied, return ObjectCreate(%ObjectPrototype%).
    if (HasSomeCompatibleType(realm, value, NullValue, UndefinedValue)) {
      return ObjectCreate(realm, realm.intrinsics.ObjectPrototype);
    }

    // 3. Return ToObject(value).
    return ToObjectPartial(realm, value);
  });

  // ECMA262 19.1.2.1
  func.defineNativeMethod("assign", 2, (context, [target, ...sources]) => {
    // 1. Let to be ? ToObject(target).
    let to = ToObjectPartial(realm, target);
    let to_must_be_partial = false;

    // 2. If only one argument was passed, return to.
    if (!sources.length) return to;

    // 3. Let sources be the List of argument values starting with the second argument.
    sources;

    // 4. For each element nextSource of sources, in ascending index order,
    for (let nextSource of sources) {
      let keys, frm;

      // a. If nextSource is undefined or null, let keys be a new empty List.
      if (HasSomeCompatibleType(realm, nextSource, NullValue, UndefinedValue)) {
        continue;
      } else { // b. Else,
        // i. Let from be ToObject(nextSource).
        frm = ToObjectPartial(realm, nextSource);
        let frm_was_partial = frm.isPartial();
        if (frm_was_partial) {
          to_must_be_partial = true;
          frm.makeNotPartial();
        }

        // ii. Let keys be ? from.[[OwnPropertyKeys]]().
        keys = frm.$OwnPropertyKeys();
        if (frm_was_partial) frm.makePartial();
      }
      if (to_must_be_partial) {
        // Only OK if to is an empty object because nextSource might have
        // properties at runtime that will overwrite current properties in to.
        // For now, just throw if this happens.
        let to_keys = to.$OwnPropertyKeys();
        if (to_keys.length !== 0) AbstractValue.throwIntrospectionError(nextSource);
      }

      invariant(frm, "from required");
      invariant(keys, "keys required");

      // c. Repeat for each element nextKey of keys in List order,
      for (let nextKey of keys) {
        // i. Let desc be ? from.[[GetOwnProperty]](nextKey).
        let desc = frm.$GetOwnProperty(nextKey);

        // ii. If desc is not undefined and desc.[[Enumerable]] is true, then
        if (desc && desc.enumerable) {
          ThrowIfMightHaveBeenDeleted(desc.value);

          // 1. Let propValue be ? Get(from, nextKey).
          let propValue = Get(realm, frm, nextKey);

          // 2. Perform ? Set(to, nextKey, propValue, true).
          Set(realm, to, nextKey, propValue, true);
        }
      }
    }

    // 5. Return to.
    if (to_must_be_partial) to.makePartial();
    return to;
  });

  // ECMA262 19.1.2.2
  func.defineNativeMethod("create", 2, (context, [O, Properties]) => {
    // 1. If Type(O) is neither Object nor Null, throw a TypeError exception.
    if (!HasSomeCompatibleType(realm, O, ObjectValue, NullValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 2. Let obj be ObjectCreate(O).
    let obj = ObjectCreate(realm, ((O.throwIfNotConcrete(): any): ObjectValue | NullValue));

    // 3. If Properties is not undefined, then
    if (!Properties.mightBeUndefined()) {
      // a. Return ? ObjectDefineProperties(obj, Properties).
      return ObjectDefineProperties(realm, obj, Properties);
    }
    Properties.throwIfNotConcrete();

    // 4. Return obj.
    return obj;
  });

  // ECMA262 19.1.2.3
  func.defineNativeMethod("defineProperties", 2, (context, [O, Properties]) => {
    // 1. Return ? ObjectDefineProperties(O, Properties).
    return ObjectDefineProperties(realm, O, Properties);
  });

  // ECMA262 19.1.2.4
  func.defineNativeMethod("defineProperty", 3, (context, [O, P, Attributes]) => {
    // 1. If Type(O) is not Object, throw a TypeError exception.
    if (!O.mightBeObject()) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }
    O = O.throwIfNotObject();

    // 2. Let key be ? ToPropertyKey(P).
    let key = ToPropertyKey(realm, P.throwIfNotConcrete());

    // 3. Let desc be ? ToPropertyDescriptor(Attributes).
    let desc = ToPropertyDescriptor(realm, Attributes);

    // 4. Perform ? DefinePropertyOrThrow(O, key, desc).
    DefinePropertyOrThrow(realm, (O: any), key, desc);

    // 4. Return O.
    return O;
  });

  // ECMA262 19.1.2.5
  func.defineNativeMethod("freeze", 1, (context, [O]) => {
    // 1. If Type(O) is not Object, return O.
    if (!O.mightBeObject()) return O;

    // 2. Let status be ? SetIntegrityLevel(O, "frozen").
    O = O.throwIfNotConcreteObject();
    let status = SetIntegrityLevel(realm, O, "frozen");

    // 3. If status is false, throw a TypeError exception.
    if (status === false) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 4. Return O.
    return O;
  });

  // ECMA262 19.1.2.6
  func.defineNativeMethod("getOwnPropertyDescriptor", 2, (context, [O, P]) => {
    // 1. Let obj be ? ToObject(O).
    let obj = ToObjectPartial(realm, O);

    // 2. Let key be ? ToPropertyKey(P).
    let key = ToPropertyKey(realm, P.throwIfNotConcrete());

    // 3. Let desc be ? obj.[[GetOwnProperty]](key).
    let desc = obj.$GetOwnProperty(key);

    // 4. Return FromPropertyDescriptor(desc).
    return FromPropertyDescriptor(realm, desc);
  });

  // ECMA262 19.1.2.7
  func.defineNativeMethod("getOwnPropertyNames", 1, (context, [O]) => {
    // 1. Return ? GetOwnPropertyKeys(O, String).
    return GetOwnPropertyKeys(realm, O, StringValue);
  });

  // ECMA262 19.1.2.8
  func.defineNativeMethod("getOwnPropertyDescriptors", 1, (context, [O]) => {
    // 1. Let obj be ? ToObject(O).
    let obj = ToObject(realm, O.throwIfNotConcrete());

    // 2. Let ownKeys be ? obj.[[OwnPropertyKeys]]().
    let ownKeys = obj.$OwnPropertyKeys();

    // 3. Let descriptors be ! ObjectCreate(%ObjectPrototype%).
    let descriptors = ObjectCreate(realm, realm.intrinsics.ObjectPrototype);

    // 4. Repeat, for each element key of ownKeys in List order,
    for (let key of ownKeys) {
      // a. Let desc be ? obj.[[GetOwnProperty]](key).
      let desc = obj.$GetOwnProperty(key);
      if (desc !== undefined) ThrowIfMightHaveBeenDeleted(desc.value);

      // b. Let descriptor be ! FromPropertyDescriptor(desc).
      let descriptor = FromPropertyDescriptor(realm, desc);

      // c. If descriptor is not undefined, perform ! CreateDataProperty(descriptors, key, descriptor).
      if (!(descriptor instanceof UndefinedValue))
        CreateDataProperty(realm, descriptors, key, descriptor);
    }

    // 5. Return descriptors.
    return descriptors;
  });

  // ECMA262 19.1.2.9
  func.defineNativeMethod("getOwnPropertySymbols", 1, (context, [O]) => {
    // Return ? GetOwnPropertyKeys(O, Symbol).
    return GetOwnPropertyKeys(realm, O, SymbolValue);
  });

  // ECMA262 19.1.2.10
  func.defineNativeMethod("getPrototypeOf", 1, (context, [O]) => {
    // 1. Let obj be ? ToObject(O).
    let obj = ToObject(realm, O.throwIfNotConcrete());

    // 2. Return ? obj.[[GetPrototypeOf]]().
    return obj.$GetPrototypeOf();
  });

  // ECMA262 19.1.2.11
  func.defineNativeMethod("is", 2, (context, [value1, value2]) => {
    // 1. Return SameValue(value1, value2).
    return new BooleanValue(realm, SameValuePartial(realm, value1, value2));
  });

  // ECMA262 19.1.2.12
  func.defineNativeMethod("isExtensible", 1, (context, [O]) => {
    // 1. If Type(O) is not Object, return false.
    if (!O.mightBeObject()) return realm.intrinsics.false;
    O = O.throwIfNotObject();

    // 2. Return ? IsExtensible(O).
    return new BooleanValue(realm, IsExtensible(realm, O));
  });

  // ECMA262 19.1.2.13
  func.defineNativeMethod("isFrozen", 1, (context, [O]) => {
    // 1. If Type(O) is not Object, return true.
    if (!O.mightBeObject()) return realm.intrinsics.true;

    // 2. Return ? TestIntegrityLevel(O, "frozen").
    O = O.throwIfNotConcreteObject();
    return new BooleanValue(realm, TestIntegrityLevel(realm, O, "frozen"));
  });

  // ECMA262 19.1.2.14
  func.defineNativeMethod("isSealed", 1, (context, [O]) => {
    // 1. If Type(O) is not Object, return true.
    if (!O.mightBeObject()) return realm.intrinsics.true;

    // 2. Return ? TestIntegrityLevel(O, "sealed").
    O = O.throwIfNotConcreteObject();
    return new BooleanValue(realm, TestIntegrityLevel(realm, O, "sealed"));
  });

  // ECMA262 19.1.2.15
  func.defineNativeMethod("keys", 1, (context, [O]) => {
    // 1. Let obj be ? ToObject(O).
    let obj = ToObject(realm, O.throwIfNotConcrete());

    // 2. Let nameList be ? EnumerableOwnProperties(obj, "key").
    let nameList = EnumerableOwnProperties(realm, obj, "key");

    // 3. Return CreateArrayFromList(nameList).
    return CreateArrayFromList(realm, nameList);
  });

  // ECMA262 9.1.2.16
  func.defineNativeMethod("values", 1, (context, [O]) => {
    // 1. Let obj be ? ToObject(O).
    let obj = ToObject(realm, O.throwIfNotConcrete());

    // 2. Let nameList be ? EnumerableOwnProperties(obj, "value").
    let nameList = EnumerableOwnProperties(realm, obj, "value");

    // 3. Return CreateArrayFromList(nameList).
    return CreateArrayFromList(realm, nameList);
  });

  // ECMA262 19.1.2.17
  func.defineNativeMethod("entries", 1, (context, [O]) => {
    // 1. Let obj be ? ToObject(O).
    let obj = ToObject(realm, O.throwIfNotConcrete());

    // 2. Let nameList be ? EnumerableOwnProperties(obj, "key+value").
    let nameList = EnumerableOwnProperties(realm, obj, "key+value");

    // 3. Return CreateArrayFromList(nameList).
    return CreateArrayFromList(realm, nameList);
  });

  // ECMA262 19.1.2.18
  func.defineNativeMethod("preventExtensions", 1, (context, [O]) => {
    // 1. If Type(O) is not Object, return O.
    if (!O.mightBeObject()) return O;

    // 2. Let status be ? O.[[PreventExtensions]]().
    O = O.throwIfNotConcreteObject();
    let status = O.$PreventExtensions();

    // 3. If status is false, throw a TypeError exception.
    if (status === false) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 4. Return O.
    return O;
  });

  // ECMA262 19.1.2.19
  func.defineNativeMethod("seal", 1, (context, [O]) => {
    // 1. If Type(O) is not Object, return O.
    if (!O.mightBeObject()) return O;

    // 2. Let status be ? SetIntegrityLevel(O, "sealed").
    O = O.throwIfNotConcreteObject();
    let status = SetIntegrityLevel(realm, O, "sealed");

    // 3. If status is false, throw a TypeError exception.
    if (status === false) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 4. Return O.
    return O;
  });

  // ECMA262 19.1.2.20
  if (realm.compatibility !== "jsc") func.defineNativeMethod("setPrototypeOf", 2, (context, [O, proto]) => {
    // 1. Let O be ? RequireObjectCoercible(O).
    O = RequireObjectCoercible(realm, O);

    // 2. If Type(proto) is neither Object nor Null, throw a TypeError exception.
    if (!HasSomeCompatibleType(realm, proto, ObjectValue, NullValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 3. If Type(O) is not Object, return O.
    O = O.throwIfNotConcrete();
    if (!(O instanceof ObjectValue)) return O;

    // 4. Let status be ? O.[[SetPrototypeOf]](proto).
    let status = O.$SetPrototypeOf(((proto: any): ObjectValue | NullValue));

    // 5. If status is false, throw a TypeError exception.
    if (status === false) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 6. Return O.
    return O;
  });

  return func;
}
