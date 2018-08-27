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
import { NativeFunctionValue, ObjectValue, StringValue, NumberValue } from "../../values/index.js";
import { Call, CreateSetIterator, IsCallable, SameValueZeroPartial } from "../../methods/index.js";
import { Properties } from "../../singletons.js";
import invariant from "../../invariant.js";
import { PropertyDescriptor } from "../../descriptors.js";

export default function(realm: Realm, obj: ObjectValue): void {
  // ECMA262 23.2.3.1
  obj.defineNativeMethod("add", 1, (context, [value]) => {
    // 1. Let S be the this value.
    let S = context.throwIfNotConcrete();

    // 2. If Type(S) is not Object, throw a TypeError exception.
    if (!(S instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 3. If S does not have a [[SetData]] internal slot, throw a TypeError exception.
    if (!S.$SetData) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 4. Let entries be the List that is the value of S's [[SetData]] internal slot.
    realm.recordModifiedProperty((S: any).$SetData_binding);
    let entries = S.$SetData;
    invariant(entries !== undefined);

    // 5. Repeat for each e that is an element of entries,
    for (let e of entries) {
      // a. If e is not empty and SameValueZero(e, value) is true, then
      if (e && SameValueZeroPartial(realm, e, value)) {
        // i. Return S.
        return S;
      }
    }

    // 6. If value is -0, let value be +0.
    value = value.throwIfNotConcrete();
    if (value instanceof NumberValue && Object.is(value.value, -0)) {
      value = realm.intrinsics.zero;
    }

    // 7. Append value as the last element of entries.
    entries.push(value);

    // 8. Return S.
    return S;
  });

  // ECMA262 23.2.3.2
  obj.defineNativeMethod("clear", 0, context => {
    // 1. Let S be the this value.
    let S = context.throwIfNotConcrete();

    // 2. If Type(S) is not Object, throw a TypeError exception.
    if (!(S instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 3. If S does not have a [[SetData]] internal slot, throw a TypeError exception.
    if (!S.$SetData) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // All of these steps can be replace with just reseting [[SetData]]
    // 4. Let entries be the List that is the value of S's [[SetData]] internal slot.
    // 5. Repeat for each e that is an element of entries,
    // 5.a Replace the element of entries whose value is e with an element whose value is empty.
    realm.recordModifiedProperty((S: any).$SetData_binding);
    S.$SetData = [];

    // 6. Return undefined.
    return realm.intrinsics.undefined;
  });

  // ECMA262 23.2.3.4
  obj.defineNativeMethod("delete", 1, (context, [value]) => {
    // 1. Let S be the this value.
    let S = context.throwIfNotConcrete();

    // 2. If Type(S) is not Object, throw a TypeError exception.
    if (!(S instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 3. If S does not have a [[SetData]] internal slot, throw a TypeError exception.
    if (!S.$SetData) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 4. Let entries be the List that is the value of S's [[SetData]] internal slot.
    realm.recordModifiedProperty((S: any).$SetData_binding);
    let entries = S.$SetData;
    invariant(entries !== undefined);

    // 5. Repeat for each e that is an element of entries,
    for (let i = 0; i < entries.length; i++) {
      let e = entries[i];

      // a. If e is not empty and SameValueZero(e, value) is true, then
      if (e !== undefined && SameValueZeroPartial(realm, e, value)) {
        // i. Replace the element of entries whose value is e with an element whose value is empty.
        entries[i] = undefined;

        // ii. Return true.
        return realm.intrinsics.true;
      }
    }

    // 6. Return false.
    return realm.intrinsics.false;
  });

  // ECMA262 23.2.3.5
  obj.defineNativeMethod("entries", 0, context => {
    // 1. Let S be the this value.
    let S = context;

    // 2. Return ? CreateSetIterator(S, "key+value").
    return CreateSetIterator(realm, S, "key+value");
  });

  // ECMA262 23.2.3.6
  obj.defineNativeMethod("forEach", 1, (context, [callbackfn, thisArg]) => {
    // 1. Let S be the this value.
    let S = context.throwIfNotConcrete();

    // 2. If Type(S) is not Object, throw a TypeError exception.
    if (!(S instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 3. If S does not have a [[SetData]] internal slot, throw a TypeError exception.
    if (!S.$SetData) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 4. If IsCallable(callbackfn) is false, throw a TypeError exception.
    if (!IsCallable(realm, callbackfn)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 5. If thisArg was supplied, let T be thisArg; else let T be undefined.
    let T = thisArg || realm.intrinsics.undefined;

    // 6. Let entries be the List that is the value of S's [[SetData]] internal slot.
    let entries = S.$SetData;
    invariant(entries);

    // 7. Repeat for each e that is an element of entries, in original insertion order
    for (let e of entries) {
      // a. If e is not empty, then
      if (e) {
        // i. Perform ? Call(callbackfn, T, « e, e, S »).
        Call(realm, callbackfn, T, [e, e, S]);
      }
    }

    // 8. Return undefined.
    return realm.intrinsics.undefined;
  });

  // ECMA262 23.2.3.7
  obj.defineNativeMethod("has", 1, (context, [value]) => {
    // 1. Let S be the this value.
    let S = context.throwIfNotConcrete();

    // 2. If Type(S) is not Object, throw a TypeError exception.
    if (!(S instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 3. If S does not have a [[SetData]] internal slot, throw a TypeError exception.
    if (!S.$SetData) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 4. Let entries be the List that is the value of S's [[SetData]] internal slot.
    let entries = S.$SetData;

    // 5. Repeat for each e that is an element of entries,
    for (let e of entries) {
      // a. If e is not empty and SameValueZero(e, value) is true, return true.
      if (e && SameValueZeroPartial(realm, e, value)) return realm.intrinsics.true;
    }

    // 6. Return false.
    return realm.intrinsics.false;
  });

  // ECMA262 23.2.3.9 get Set.prototype.size
  obj.$DefineOwnProperty(
    "size",
    new PropertyDescriptor({
      get: new NativeFunctionValue(realm, undefined, "get size", 0, context => {
        // 1. Let S be the this value.
        let S = context.throwIfNotConcrete();

        // 2. If Type(S) is not Object, throw a TypeError exception.
        if (!(S instanceof ObjectValue)) {
          throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
        }

        // 3. If S does not have a [[SetData]] internal slot, throw a TypeError exception.
        if (!S.$SetData) {
          throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
        }

        // 4. Let entries be the List that is the value of S's [[SetData]] internal slot.
        let entries = S.$SetData;

        // 5. Let count be 0.
        let count = 0;

        // 6. For each e that is an element of entries
        for (let e of entries) {
          // a. If e is not empty, set count to count+1.
          if (e) count++;
        }

        // 7. Return count.
        return new NumberValue(realm, count);
      }),
      configurable: true,
    })
  );

  // ECMA262 23.2.3.10
  obj.defineNativeMethod("values", 0, context => {
    // 1. Let S be the this value.
    let S = context;

    // 2. Return ? CreateSetIterator(S, "value").
    return CreateSetIterator(realm, S, "value");
  });

  // ECMA262 23.2.3.8
  let valuesPropertyDescriptor = obj.$GetOwnProperty("values");
  invariant(valuesPropertyDescriptor instanceof PropertyDescriptor);
  Properties.ThrowIfMightHaveBeenDeleted(valuesPropertyDescriptor);
  obj.$DefineOwnProperty("keys", valuesPropertyDescriptor);

  // ECMA262 23.2.3.11
  obj.$DefineOwnProperty(realm.intrinsics.SymbolIterator, valuesPropertyDescriptor);

  // ECMA262 23.2.3.12 Set.prototype [ @@toStringTag ]
  obj.defineNativeProperty(realm.intrinsics.SymbolToStringTag, new StringValue(realm, "Set"), { writable: false });
}
