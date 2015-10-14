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
import { NativeFunctionValue, ObjectValue, BooleanValue, StringValue,  NullValue } from "../../values/index.js";
import { ThrowCompletion } from "../../completions.js";
import { ToPropertyKey, ToObject, ToObjectPartial } from "../../methods/to.js";
import { SameValuePartial, RequireObjectCoercible } from "../../methods/abstract.js";
import { HasOwnProperty, HasSomeCompatibleType } from "../../methods/has.js";
import { Invoke } from "../../methods/call.js";
import { ThrowIfMightHaveBeenDeleted } from "../../methods/index.js";
import { Construct } from "../../methods/construct.js";
import invariant from "../../invariant.js";

export default function (realm: Realm, obj: ObjectValue): void {
  // ECMA262 19.1.3.2
  obj.defineNativeMethod("hasOwnProperty", 1, (context, [V]) => {
    // 1. Let P be ? ToPropertyKey(V).
    let P = ToPropertyKey(realm, V.throwIfNotConcrete());

    // 2. Let O be ? ToObject(this value).
    let O = ToObjectPartial(realm, context);

    // 3. Return ? HasOwnProperty(O, P).
    return new BooleanValue(realm, HasOwnProperty(realm, O, P));
  });

  // ECMA262 19.1.3.3
  obj.defineNativeMethod("isPrototypeOf", 1, (context, [V]) => {
    // 1. If Type(V) is not Object, return false.
    if (!V.mightBeObject()) return realm.intrinsics.false;
    V = V.throwIfNotConcreteObject();

    // 2. Let O be ? ToObject(this value).
    let O = ToObjectPartial(realm, context);

    // 3. Repeat
    while (true) {
      // a. Let V be ? V.[[GetPrototypeOf]]().
      V = V.$GetPrototypeOf();

      // b. If V is null, return false.
      if (V instanceof NullValue) return realm.intrinsics.false;

      // c. If SameValue(O, V) is true, return true.
      if (SameValuePartial(realm, O, V) === true) return realm.intrinsics.true;
    }

    invariant(false);
  });

  // ECMA262 19.1.3.4
  obj.defineNativeMethod("propertyIsEnumerable", 1, (context, [V]) => {
    // 1. Let P be ? ToPropertyKey(V).
    let P = ToPropertyKey(realm, V.throwIfNotConcrete());

    // 2. Let O be ? ToObject(this value).
    let O = ToObjectPartial(realm, context);

    // 3. Let desc be ? O.[[GetOwnProperty]](P).
    let desc = O.$GetOwnProperty(P);

    // 4. If desc is undefined, return false.
    if (!desc) return realm.intrinsics.false;
    ThrowIfMightHaveBeenDeleted(desc.value);

    // 5. Return the value of desc.[[Enumerable]].
    return desc.enumerable === undefined
      ? realm.intrinsics.undefined
      : new BooleanValue(realm, desc.enumerable);
  });

  // ECMA262 19.1.3.5
  obj.defineNativeMethod("toLocaleString", 0, (context) => {
    // 1. Let O be the this value.
    let O = context;

    // 2. Return ? Invoke(O, "toString").
    return Invoke(realm, O, "toString");
  });

  // ECMA262 19.1.3.6
  obj.defineNativeProperty("toString", realm.intrinsics.ObjectProto_toString);

  // ECMA262 19.1.3.7
  obj.defineNativeMethod("valueOf", 0, (context) => {
    // 1. Return ? ToObject(this value).
    return ToObjectPartial(realm, context);
  });

  obj.$DefineOwnProperty("__proto__", {
    // B.2.2.1.1
    get: new NativeFunctionValue(realm, "TODO", "get __proto__", 0, (context) => {
      // 1. Let O be ? ToObject(this value).
      let O = ToObject(realm, context.throwIfNotConcrete());

      // 2. Return ? O.[[GetPrototypeOf]]().
      return O.$GetPrototypeOf();
    }),

    // B.2.2.1.2
    set: new NativeFunctionValue(realm, "TODO", "set __proto__", 1, (context, [proto]) => {
      // 1. Let O be ? RequireObjectCoercible(this value).
      let O = RequireObjectCoercible(realm, context);

      // 2. If Type(proto) is neither Object nor Null, return undefined.
      if (!HasSomeCompatibleType(realm, proto, ObjectValue, NullValue)) return realm.intrinsics.undefined;

      // 3. If Type(O) is not Object, return undefined.
      if (!O.mightBeObject()) return realm.intrinsics.undefined;
      O = O.throwIfNotConcreteObject();

      // 4. Let status be ? O.[[SetPrototypeOf]](proto).
      let status = O.$SetPrototypeOf(((proto.throwIfNotConcrete(): any): ObjectValue | NullValue));

      // 5. If status is false, throw a TypeError exception.
      if (!status) {
        throw new ThrowCompletion(
          Construct(realm, realm.intrinsics.TypeError, [new StringValue(realm, "couldn't set proto")])
        );
      }

      // 6. Return undefined.
      return realm.intrinsics.undefined;
    })
  });
}
