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
import {
  AbstractValue,
  NativeFunctionValue,
  ObjectValue,
  BooleanValue,
  NullValue,
  StringValue,
} from "../../values/index.js";
import { SameValuePartial, RequireObjectCoercible } from "../../methods/abstract.js";
import { HasOwnProperty, HasSomeCompatibleType } from "../../methods/has.js";
import { Invoke } from "../../methods/call.js";
import { Properties, To } from "../../singletons.js";
import { FatalError } from "../../errors.js";
import invariant from "../../invariant.js";
import { TypesDomain, ValuesDomain } from "../../domains/index.js";
import { createOperationDescriptor } from "../../utils/generator.js";
import { PropertyDescriptor } from "../../descriptors.js";

export default function(realm: Realm, obj: ObjectValue): void {
  // ECMA262 19.1.3.2
  const ObjectPrototypeHasOwnPrototype = obj.defineNativeMethod("hasOwnProperty", 1, (context, [V]) => {
    // 1. Let P be ? ToPropertyKey(V).
    let P = To.ToPropertyKey(realm, V.throwIfNotConcrete());

    // The pure parts are wrapped with a recovery mode.
    try {
      // 2. Let O be ? ToObject(this value).
      let O = To.ToObject(realm, context);

      // 3. Return ? HasOwnProperty(O, P).
      return new BooleanValue(realm, HasOwnProperty(realm, O, P));
    } catch (x) {
      if (realm.isInPureScope() && x instanceof FatalError) {
        // If we're in pure scope we can try to recover from any fatals by
        // leaving the call in place which we do by default, but we don't
        // have to leak the state of any arguments since this function is pure.
        // This also lets us define the return type properly.
        const key = typeof P === "string" ? new StringValue(realm, P) : P;
        return realm.evaluateWithPossibleThrowCompletion(
          () =>
            AbstractValue.createTemporalFromBuildFunction(
              realm,
              BooleanValue,
              [ObjectPrototypeHasOwnPrototype, context, key],
              createOperationDescriptor("OBJECT_PROTO_HAS_OWN_PROPERTY")
            ),
          TypesDomain.topVal,
          ValuesDomain.topVal
        );
      }
      throw x;
    }
  });

  // ECMA262 19.1.3.3
  obj.defineNativeMethod("isPrototypeOf", 1, (context, [V]) => {
    // 1. If Type(V) is not Object, return false.
    if (!V.mightBeObject()) return realm.intrinsics.false;
    V = V.throwIfNotConcreteObject();

    // 2. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

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
    let P = To.ToPropertyKey(realm, V.throwIfNotConcrete());

    // 2. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    // 3. Let desc be ? O.[[GetOwnProperty]](P).
    let desc = O.$GetOwnProperty(P);

    // 4. If desc is undefined, return false.
    if (!desc) return realm.intrinsics.false;
    Properties.ThrowIfMightHaveBeenDeleted(desc);
    desc = desc.throwIfNotConcrete(realm);

    // 5. Return the value of desc.[[Enumerable]].
    return desc.enumerable === undefined ? realm.intrinsics.undefined : new BooleanValue(realm, desc.enumerable);
  });

  // ECMA262 19.1.3.5
  obj.defineNativeMethod("toLocaleString", 0, context => {
    // 1. Let O be the this value.
    let O = context;

    // 2. Return ? Invoke(O, "toString").
    return Invoke(realm, O, "toString");
  });

  // ECMA262 19.1.3.6
  obj.defineNativeProperty("toString", realm.intrinsics.ObjectProto_toString);

  // ECMA262 19.1.3.7
  obj.defineNativeMethod("valueOf", 0, context => {
    // 1. Return ? ToObject(this value).
    return To.ToObject(realm, context);
  });

  obj.$DefineOwnProperty(
    "__proto__",
    new PropertyDescriptor({
      // B.2.2.1.1
      get: new NativeFunctionValue(realm, undefined, "get __proto__", 0, context => {
        // 1. Let O be ? ToObject(this value).
        let O = To.ToObject(realm, context);

        // 2. Return ? O.[[GetPrototypeOf]]().
        return O.$GetPrototypeOf();
      }),

      // B.2.2.1.2
      set: new NativeFunctionValue(realm, undefined, "set __proto__", 1, (context, [proto]) => {
        // 1. Let O be ? RequireObjectCoercible(this value).
        let O = RequireObjectCoercible(realm, context);

        // 2. If Type(proto) is neither Object nor Null, return undefined.
        if (!HasSomeCompatibleType(proto, ObjectValue, NullValue)) return realm.intrinsics.undefined;

        // 3. If Type(O) is not Object, return undefined.
        if (!O.mightBeObject()) return realm.intrinsics.undefined;
        O = O.throwIfNotConcreteObject();

        // 4. Let status be ? O.[[SetPrototypeOf]](proto).
        let status = O.$SetPrototypeOf(((proto.throwIfNotConcrete(): any): ObjectValue | NullValue));

        // 5. If status is false, throw a TypeError exception.
        if (!status) {
          throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "couldn't set proto");
        }

        // 6. Return undefined.
        return realm.intrinsics.undefined;
      }),
    })
  );
}
