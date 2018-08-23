/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { PropertyKeyValue } from "../types.js";
import type { Realm } from "../realm.js";
import { Get, IsArrayIndex } from "./index.js";
import { StringValue, ObjectValue, Value, ArrayValue } from "../values/index.js";
import { Create, Properties, To } from "../singletons.js";

import invariant from "../invariant.js";

// ECMA262 19.1.2.8.1
export function GetOwnPropertyKeys(realm: Realm, O: Value, Type: Function): ArrayValue {
  // 1. Let obj be ? ToObject(O).
  let obj = To.ToObject(realm, O);

  // 2. Let keys be ? obj.[[OwnPropertyKeys]]().
  let keys = obj.$OwnPropertyKeys();

  // 3. Let nameList be a new empty List.
  let nameList = [];

  // 4. Repeat for each element nextKey of keys in List order,
  for (let nextKey of keys) {
    // a. If Type(nextKey) is Type, then
    if (nextKey instanceof Type) {
      // i. Append nextKey as the last element of nameList.
      nameList.push(nextKey);
    }
  }

  // 1. Return CreateArrayFromList(nameList).
  return Create.CreateArrayFromList(realm, nameList);
}

// ECMA262 9.1.11.1
export function OrdinaryOwnPropertyKeys(
  realm: Realm,
  o: ObjectValue,
  getOwnPropertyKeysEvenIfPartial?: boolean = false
): Array<PropertyKeyValue> {
  // 1. Let keys be a new empty List.
  let keys = [];

  // 2. For each own property key P of O that is an integer index, in ascending numeric index order
  let properties = Properties.GetOwnPropertyKeysArray(realm, o, false, getOwnPropertyKeysEvenIfPartial);
  for (let key of properties
    .filter(x => IsArrayIndex(realm, x))
    .map(x => parseInt(x, 10))
    .sort((x, y) => x - y)) {
    // i. Add P as the last element of keys.
    keys.push(new StringValue(realm, key + ""));
  }

  // 3. For each own property key P of O that is a String but is not an integer index, in ascending chronological order of property creation
  for (let key of properties.filter(x => !IsArrayIndex(realm, x))) {
    // i. Add P as the last element of keys.
    keys.push(new StringValue(realm, key));
  }

  // 4. For each own property key P of O that is a Symbol, in ascending chronological order of property creation
  for (let key of o.symbols.keys()) {
    // i. Add P as the last element of keys.
    keys.push(key);
  }

  // 5. Return keys.
  return keys;
}

// ECMA262 7.3.21
export function EnumerableOwnProperties(
  realm: Realm,
  O: ObjectValue,
  kind: string,
  getOwnPropertyKeysEvenIfPartial?: boolean = false
): Array<Value> {
  // 1. Assert: Type(O) is Object.
  invariant(O instanceof ObjectValue, "expected object");

  // 2. Let ownKeys be ? O.[[OwnPropertyKeys]]().
  let ownKeys = O.$OwnPropertyKeys(getOwnPropertyKeysEvenIfPartial);

  // 3. Let properties be a new empty List.
  let properties = [];

  // 4. Repeat, for each element key of ownKeys in List order
  for (let key of ownKeys) {
    // a. If Type(key) is String, then
    if (key instanceof StringValue) {
      // i. Let desc be ? O.[[GetOwnProperty]](key).
      let desc = O.$GetOwnProperty(key);

      // ii. If desc is not undefined and desc.[[Enumerable]] is true, then
      if (desc && desc.throwIfNotConcrete(realm).enumerable) {
        Properties.ThrowIfMightHaveBeenDeleted(desc);

        // 1. If kind is "key", append key to properties.
        if (kind === "key") {
          properties.push(key);
        } else {
          // 2. Else,
          // a. Let value be ? Get(O, key).
          let value = Get(realm, O, key);

          // b. If kind is "value", append value to properties.
          if (kind === "value") {
            properties.push(value);
          } else {
            // c. Else,
            // i. Assert: kind is "key+value".
            invariant(kind === "key+value", "expected kind to be key+value");

            // ii. Let entry be CreateArrayFromList(« key, value »).
            let entry = Create.CreateArrayFromList(realm, [key, value]);

            // iii. Append entry to properties.
            properties.push(entry);
          }
        }
      }
    }
  }

  // 5. Order the elements of properties so they are in the same relative order as would be produced by the Iterator that would be returned if the EnumerateObjectProperties internal method was invoked with O.

  // 6. Return properties.
  return properties;
}
