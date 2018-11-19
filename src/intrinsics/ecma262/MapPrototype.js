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
import { NumberValue, StringValue, NativeFunctionValue, ObjectValue } from "../../values/index.js";
import { Call, CreateMapIterator, IsCallable, SameValueZeroPartial } from "../../methods/index.js";
import { Properties } from "../../singletons.js";
import invariant from "../../invariant.js";
import { PropertyDescriptor } from "../../descriptors.js";

export default function(realm: Realm, obj: ObjectValue): void {
  // ECMA262 23.1.3.1
  obj.defineNativeMethod("clear", 0, context => {
    // 1. Let M be the this value.
    let M = context.throwIfNotConcrete();

    // 2. If Type(M) is not Object, throw a TypeError exception.
    if (!(M instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 3. If M does not have a [[MapData]] internal slot, throw a TypeError exception.
    if (!M.$MapData) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 4. Let entries be the List that is the value of M's [[MapData]] internal slot.
    realm.recordModifiedProperty((M: any).$MapData_binding);
    let entries = M.$MapData;
    invariant(entries !== undefined);

    // 5. Repeat for each Record {[[Key]], [[Value]]} p that is an element of entries,
    for (let p of entries) {
      // a. Set p.[[Key]] to empty.
      p.$Key = undefined;

      // b. Set p.[[Value]] to empty.
      p.$Value = undefined;
    }

    // 6. Return undefined.
    return realm.intrinsics.undefined;
  });

  // ECMA262 23.1.3.3
  obj.defineNativeMethod("delete", 1, (context, [key]) => {
    // 1. Let M be the this value.
    let M = context.throwIfNotConcrete();

    // 2. If Type(M) is not Object, throw a TypeError exception.
    if (!(M instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 3. If M does not have a [[MapData]] internal slot, throw a TypeError exception.
    if (!M.$MapData) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 4. Let entries be the List that is the value of M's [[MapData]] internal slot.
    realm.recordModifiedProperty((M: any).$MapData_binding);
    let entries = M.$MapData;
    invariant(entries !== undefined);

    // 5. Repeat for each Record {[[Key]], [[Value]]} p that is an element of entries,
    for (let p of entries) {
      // a. If p.[[Key]] is not empty and SameValueZero(p.[[Key]], key) is true, then
      if (p.$Key !== undefined && SameValueZeroPartial(realm, p.$Key, key)) {
        // i. Set p.[[Key]] to empty.
        p.$Key = undefined;

        // ii. Set p.[[Value]] to empty.
        p.$Value = undefined;

        // iii. Return true.
        return realm.intrinsics.true;
      }
    }

    // 6. Return false.
    return realm.intrinsics.false;
  });

  // ECMA262 23.1.3.4
  obj.defineNativeMethod("entries", 0, context => {
    // 1. Let M be the this value.
    let M = context;

    // 2. Return ? CreateMapIterator(M, "key+value").
    return CreateMapIterator(realm, M, "key+value");
  });

  // ECMA262 23.1.3.5
  obj.defineNativeMethod("forEach", 1, (context, [callbackfn, thisArg]) => {
    // 1. Let M be the this value.
    let M = context.throwIfNotConcrete();

    // 2. If Type(M) is not Object, throw a TypeError exception.
    if (!(M instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 3. If M does not have a [[MapData]] internal slot, throw a TypeError exception.
    if (!M.$MapData) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 4. If IsCallable(callbackfn) is false, throw a TypeError exception.
    if (!IsCallable(realm, callbackfn)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 5. If thisArg was supplied, let T be thisArg; else let T be undefined.
    let T = thisArg || realm.intrinsics.undefined;

    // 6. Let entries be the List that is the value of M's [[MapData]] internal slot.
    let entries = M.$MapData;
    invariant(entries);

    // 7. Repeat for each Record {[[Key]], [[Value]]} e that is an element of entries, in original key insertion order
    for (let e of entries) {
      // a. If e.[[Key]] is not empty, then
      if (e.$Key !== undefined) {
        // i. Perform ? Call(callbackfn, T, « e.[[Value]], e.[[Key]], M »).
        invariant(e.$Value !== undefined);
        Call(realm, callbackfn, T, [e.$Value, e.$Key, M]);
      }
    }

    // 8. Return undefined.
    return realm.intrinsics.undefined;
  });

  // ECMA262 23.1.3.6
  obj.defineNativeMethod("get", 1, (context, [key]) => {
    // 1. Let M be the this value.
    let M = context.throwIfNotConcrete();

    // 2. If Type(M) is not Object, throw a TypeError exception.
    if (!(M instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 3. If M does not have a [[MapData]] internal slot, throw a TypeError exception.
    if (!M.$MapData) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 4. Let entries be the List that is the value of M's [[MapData]] internal slot.
    let entries = M.$MapData;
    invariant(entries !== undefined);

    // 5. Repeat for each Record {[[Key]], [[Value]]} p that is an element of entries,
    for (let p of entries) {
      // a. If p.[[Key]] is not empty and SameValueZero(p.[[Key]], key) is true, return p.[[Value]].
      if (p.$Key !== undefined && SameValueZeroPartial(realm, p.$Key, key)) {
        invariant(p.$Value !== undefined);
        return p.$Value;
      }
    }

    // 6. Return undefined.
    return realm.intrinsics.undefined;
  });

  // ECMA262 23.1.3.7
  obj.defineNativeMethod("has", 1, (context, [key]) => {
    // 1. Let M be the this value.
    let M = context.throwIfNotConcrete();

    // 2. If Type(M) is not Object, throw a TypeError exception.
    if (!(M instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 3. If M does not have a [[MapData]] internal slot, throw a TypeError exception.
    if (!M.$MapData) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 4. Let entries be the List that is the value of M's [[MapData]] internal slot.
    let entries = M.$MapData;
    invariant(entries !== undefined);

    // 5. Repeat for each Record {[[Key]], [[Value]]} p that is an element of entries,
    for (let p of entries) {
      // a. If p.[[Key]] is not empty and SameValueZero(p.[[Key]], key) is true, return true.
      if (p.$Key !== undefined && SameValueZeroPartial(realm, p.$Key, key)) {
        return realm.intrinsics.true;
      }
    }

    // 6. Return false.
    return realm.intrinsics.false;
  });

  // ECMA262 23.1.3.8
  obj.defineNativeMethod("keys", 0, context => {
    // 1. Let M be the this value.
    let M = context;

    // 2. Return ? CreateMapIterator(M, "key").
    return CreateMapIterator(realm, M, "key");
  });

  // ECMA262 23.1.3.9
  obj.defineNativeMethod("set", 2, (context, [key, value]) => {
    // 1. Let M be the this value.
    let M = context.throwIfNotConcrete();

    // 2. If Type(M) is not Object, throw a TypeError exception.
    if (!(M instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 3. If M does not have a [[MapData]] internal slot, throw a TypeError exception.
    if (!M.$MapData) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 4. Let entries be the List that is the value of M's [[MapData]] internal slot.
    realm.recordModifiedProperty((M: any).$MapData_binding);
    let entries = M.$MapData;
    invariant(entries !== undefined);

    // 5. Repeat for each Record {[[Key]], [[Value]]} p that is an element of entries,
    for (let p of entries) {
      // a. If p.[[Key]] is not empty and SameValueZero(p.[[Key]], key) is true, then
      if (p.$Key !== undefined && SameValueZeroPartial(realm, p.$Key, key)) {
        // i. Set p.[[Value]] to value.
        p.$Value = value;

        // ii. Return M.
        return M;
      }
    }

    // 6. If key is -0, let key be +0.
    key = key.throwIfNotConcrete();
    if (key instanceof NumberValue && Object.is(key.value, -0)) key = realm.intrinsics.zero;

    // 7. Let p be the Record {[[Key]]: key, [[Value]]: value}.
    let p = { $Key: key, $Value: value };

    // 8. Append p as the last element of entries.
    entries.push(p);

    // 9. Return M.
    return M;
  });

  // ECMA262 23.1.3.10
  obj.$DefineOwnProperty(
    "size",
    new PropertyDescriptor({
      configurable: true,
      get: new NativeFunctionValue(realm, undefined, "get size", 0, context => {
        // 1. Let M be the this value.
        let M = context.throwIfNotConcrete();

        // 2. If Type(M) is not Object, throw a TypeError exception.
        if (!(M instanceof ObjectValue)) {
          throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
        }

        // 3. If M does not have a [[MapData]] internal slot, throw a TypeError exception.
        if (!M.$MapData) {
          throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
        }

        // 4. Let entries be the List that is the value of M's [[MapData]] internal slot.
        let entries = M.$MapData;
        invariant(entries !== undefined);

        // 5. Let count be 0.
        let count = 0;

        // 6. For each Record {[[Key]], [[Value]]} p that is an element of entries
        for (let p of entries) {
          // a. If p.[[Key]] is not empty, set count to count+1.
          if (p.$Key !== undefined) count++;
        }

        // 7. Return count.
        return new NumberValue(realm, count);
      }),
    })
  );

  // ECMA262 23.1.3.11
  obj.defineNativeMethod("values", 0, context => {
    // 1. Let M be the this value.
    let M = context;

    // 2. Return ? CreateMapIterator(M, "value").
    return CreateMapIterator(realm, M, "value");
  });

  // ECMA262 23.1.3.12
  let entriesPropertyDescriptor = obj.$GetOwnProperty("entries");
  invariant(entriesPropertyDescriptor instanceof PropertyDescriptor);
  Properties.ThrowIfMightHaveBeenDeleted(entriesPropertyDescriptor);
  obj.$DefineOwnProperty(realm.intrinsics.SymbolIterator, entriesPropertyDescriptor);

  // ECMA262 23.1.3.13
  obj.defineNativeProperty(realm.intrinsics.SymbolToStringTag, new StringValue(realm, "Map"), { writable: false });
}
