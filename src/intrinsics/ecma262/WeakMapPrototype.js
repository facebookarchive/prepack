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
  // ECMA262 23.3.3.6
  obj.defineNativeProperty(realm.intrinsics.SymbolToStringTag, new StringValue(realm, "WeakMap"), { writable: false });

  // ECMA262 23.3.3.2
  obj.defineNativeMethod("delete", 1, (context, [key]) => {
    // 1. Let M be the this value.
    let M = context.throwIfNotConcrete();

    // 2. If Type(M) is not Object, throw a TypeError exception.
    if (!(M instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 3. If M does not have a [[WeakMapData]] internal slot, throw a TypeError exception.
    if (!M.$WeakMapData) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 4. Let entries be the List that is the value of M's [[WeakMapData]] internal slot.
    let entries = M.$WeakMapData;
    realm.recordModifiedProperty((M: any).$WeakMapData_binding);
    invariant(entries !== undefined);

    // 5. If Type(key) is not Object, return false.
    key = key.throwIfNotConcrete();
    if (!(key instanceof ObjectValue)) {
      return realm.intrinsics.false;
    }

    // 6. Repeat for each Record {[[Key]], [[Value]]} p that is an element of entries,
    for (let p of entries) {
      // a. If p.[[Key]] is not empty and SameValue(p.[[Key]], key) is true, then
      if (p.$Key !== undefined && SameValuePartial(realm, p.$Key, key)) {
        // i. Set p.[[Key]] to empty.
        p.$Key = undefined;

        // ii. Set p.[[Value]] to empty.
        p.$Value = undefined;

        // iii. Return true.
        return realm.intrinsics.true;
      }
    }

    // 7. Return false.
    return realm.intrinsics.false;
  });

  // ECMA262 23.3.3.3
  obj.defineNativeMethod("get", 1, (context, [key]) => {
    // 1. Let M be the this value.
    let M = context.throwIfNotConcrete();

    // 2. If Type(M) is not Object, throw a TypeError exception.
    if (!(M instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 3. If M does not have a [[WeakMapData]] internal slot, throw a TypeError exception.
    if (!M.$WeakMapData) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 4. Let entries be the List that is the value of M's [[WeakMapData]] internal slot.
    let entries = M.$WeakMapData;
    invariant(entries !== undefined);

    // 5. If Type(key) is not Object, return undefined.
    key = key.throwIfNotConcrete();
    if (!(key instanceof ObjectValue)) {
      return realm.intrinsics.undefined;
    }

    // 6. Repeat for each Record {[[Key]], [[Value]]} p that is an element of entries,
    for (let p of entries) {
      // a. If p.[[Key]] is not empty and SameValue(p.[[Key]], key) is true, return p.[[Value]].
      if (p.$Key !== undefined && SameValuePartial(realm, p.$Key, key)) {
        invariant(p.$Value !== undefined);
        return p.$Value;
      }
    }

    // 7. Return undefined.
    return realm.intrinsics.undefined;
  });

  // ECMA262 23.3.3.4
  obj.defineNativeMethod("has", 1, (context, [key]) => {
    // 1. Let M be the this value.
    let M = context.throwIfNotConcrete();

    // 2. If Type(M) is not Object, throw a TypeError exception.
    if (!(M instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 3. If M does not have a [[WeakMapData]] internal slot, throw a TypeError exception.
    if (!M.$WeakMapData) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 4. Let entries be the List that is the value of M's [[WeakMapData]] internal slot.
    let entries = M.$WeakMapData;
    invariant(entries !== undefined);

    // 5. If Type(key) is not Object, return false.
    key = key.throwIfNotConcrete();
    if (!(key instanceof ObjectValue)) {
      return realm.intrinsics.false;
    }

    // 6. Repeat for each Record {[[Key]], [[Value]]} p that is an element of entries,
    for (let p of entries) {
      // a. If p.[[Key]] is not empty and SameValue(p.[[Key]], key) is true, return true.
      if (p.$Key !== undefined && SameValuePartial(realm, p.$Key, key)) return realm.intrinsics.true;
    }

    // 7. Return false.
    return realm.intrinsics.false;
  });

  // ECMA262 23.3.3.5
  obj.defineNativeMethod("set", 2, (context, [key, value]) => {
    // 1. Let M be the this value.
    let M = context.throwIfNotConcrete();

    // 2. If Type(M) is not Object, throw a TypeError exception.
    if (!(M instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 3. If M does not have a [[WeakMapData]] internal slot, throw a TypeError exception.
    if (!M.$WeakMapData) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 4. Let entries be the List that is the value of M's [[WeakMapData]] internal slot.
    realm.recordModifiedProperty((M: any).$WeakMapData_binding);
    let entries = M.$WeakMapData;
    invariant(entries !== undefined);

    // 5. If Type(key) is not Object, throw a TypeError exception.
    key = key.throwIfNotConcrete();
    if (!(key instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 6. Repeat for each Record {[[Key]], [[Value]]} p that is an element of entries,
    for (let p of entries) {
      // a. If p.[[Key]] is not empty and SameValue(p.[[Key]], key) is true, then
      if (p.$Key !== undefined && SameValuePartial(realm, p.$Key, key)) {
        // i. Set p.[[Value]] to value.
        p.$Value = value;

        // ii. Return M.
        return M;
      }
    }

    // 7. Let p be the Record {[[Key]]: key, [[Value]]: value}.
    let p = { $Key: key, $Value: value };

    // 8. Append p as the last element of entries.
    entries.push(p);

    // 9. Return M.
    return M;
  });
}
