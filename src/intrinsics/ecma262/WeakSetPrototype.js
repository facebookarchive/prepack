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
import { StringValue, ObjectValue } from "../../values/index.js";
import { SameValuePartial } from "../../methods/index.js";
import invariant from "../../invariant.js";

export default function(realm: Realm, obj: ObjectValue): void {
  // ECMA262 23.4.3.1
  obj.defineNativeMethod("add", 1, (context, [value]) => {
    // 1. Let S be the this value.
    let S = context.throwIfNotConcrete();

    // 2. If Type(S) is not Object, throw a TypeError exception.
    if (!(S instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Type(S) is not Object");
    }

    // 3. If S does not have a [[WeakSetData]] internal slot, throw a TypeError exception.
    if (!S.$WeakSetData) {
      throw realm.createErrorThrowCompletion(
        realm.intrinsics.TypeError,
        "S does not have a [[WeakSetData]] internal slot"
      );
    }

    // 4. If Type(value) is not Object, throw a TypeError exception.
    value = value.throwIfNotConcrete();
    if (!(value instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Type(value) is not Object");
    }

    // 5. Let entries be the List that is S.[[WeakSetData]].
    realm.recordModifiedProperty((S: any).$WeakSetData_binding);
    let entries = S.$WeakSetData;
    invariant(entries != null);

    // 6. Repeat for each e that is an element of entries,
    for (let e of entries) {
      // a. If e is not empty and SameValue(e, value) is true, then
      if (e !== undefined && SameValuePartial(realm, e, value) === true) {
        // i. Return S.
        return S;
      }
    }

    // 7. Append value as the last element of entries.
    entries.push(value);

    // 8. Return S.
    return S;
  });

  // ECMA262 23.4.3.3
  obj.defineNativeMethod("delete", 1, (context, [value]) => {
    // 1. Let S be the this value.
    let S = context.throwIfNotConcrete();

    // 2. If Type(S) is not Object, throw a TypeError exception.
    if (!(S instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Type(S) is not Object");
    }

    // 3. If S does not have a [[WeakSetData]] internal slot, throw a TypeError exception.
    if (!S.$WeakSetData) {
      throw realm.createErrorThrowCompletion(
        realm.intrinsics.TypeError,
        "S does not have a [[WeakSetData]] internal slot"
      );
    }

    // 4. If Type(value) is not Object, throw a TypeError exception.
    value = value.throwIfNotConcrete();
    if (!(value instanceof ObjectValue)) return realm.intrinsics.false;

    // 5. Let entries be the List that is S.[[WeakSetData]].
    realm.recordModifiedProperty((S: any).$WeakSetData_binding);
    let entries = S.$WeakSetData;
    invariant(entries != null);

    // 6. Repeat for each e that is an element of entries,
    for (let i = 0; i < entries.length; ++i) {
      let e = entries[i];

      // a. If e is not empty and SameValue(e, value) is true, then
      if (e !== undefined && SameValuePartial(realm, e, value) === true) {
        // i. Replace the element of entries whose value is e with an element whose value is empty.
        entries[i] = undefined;

        // ii. Return true.
        return realm.intrinsics.true;
      }
    }

    // 7. Return false.
    return realm.intrinsics.false;
  });

  // ECMA262 23.4.3.3
  obj.defineNativeMethod("has", 1, (context, [value]) => {
    // 1. Let S be the this value.
    let S = context.throwIfNotConcrete();

    // 2. If Type(S) is not Object, throw a TypeError exception.
    if (!(S instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "Type(S) is not Object");
    }

    // 3. If S does not have a [[WeakSetData]] internal slot, throw a TypeError exception.
    if (!S.$WeakSetData) {
      throw realm.createErrorThrowCompletion(
        realm.intrinsics.TypeError,
        "S does not have a [[WeakSetData]] internal slot"
      );
    }

    // 4. Let entries be the List that is S.[[WeakSetData]].
    let entries = S.$WeakSetData;

    // 5. If Type(value) is not Object, return false.
    value = value.throwIfNotConcrete();
    if (!(value instanceof ObjectValue)) return realm.intrinsics.false;

    // 6. Repeat for each e that is an element of entries,
    for (let e of entries) {
      // a. If e is not empty and SameValue(e, value) is true, return true.
      if (e !== undefined && SameValuePartial(realm, e, value) === true) return realm.intrinsics.true;
    }

    // 7. Return false.
    return realm.intrinsics.false;
  });

  // ECMA262 23.4.3.5
  obj.defineNativeProperty(realm.intrinsics.SymbolToStringTag, new StringValue(realm, "WeakSet"), { writable: false });
}
