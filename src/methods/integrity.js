/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import type { Realm } from "../realm.js";
import { ObjectValue } from "../values/index.js";
import { IsExtensible, IsDataDescriptor, IsAccessorDescriptor } from "./index.js";
import { Properties } from "../singletons.js";
import { FatalError } from "../errors.js";
import invariant from "../invariant.js";

type IntegrityLevels = "sealed" | "frozen";

// ECMA262 9.1.4.1
export function OrdinaryPreventExtensions(realm: Realm, O: ObjectValue): boolean {
  if (O.isLeakedObject() && O.getExtensible()) {
    // todo: emit a diagnostic messsage
    throw new FatalError();
  }

  // 1. Set the value of the [[Extensible]] internal slot of O to false.
  O.setExtensible(false);

  // 2. Return true.
  return true;
}

// ECMA262 7.3.14
export function SetIntegrityLevel(realm: Realm, O: ObjectValue, level: IntegrityLevels): boolean {
  // 1. Assert: Type(O) is Object.
  invariant(O instanceof ObjectValue, "expected an object");

  // 2. Assert: level is either "sealed" or "frozen".
  invariant(level === "sealed" || level === "frozen", "invalid level");

  // 3. Let status be ? O.[[PreventExtensions]]().
  let status = O.$PreventExtensions();

  // 4. If status is false, return false.
  if (status === false) return false;

  // 5. Let keys be ? O.[[OwnPropertyKeys]]().
  let keys = O.$OwnPropertyKeys();

  // 6. If level is "sealed", then
  if (level === "sealed") {
    // a. Repeat for each element k of keys,
    for (let k of keys) {
      // i. Perform ? DefinePropertyOrThrow(O, k, PropertyDescriptor{[[Configurable]]: false}).
      Properties.DefinePropertyOrThrow(realm, O, k, {
        configurable: false,
      });
    }
  } else if (level === "frozen") {
    // 7. Else level is "frozen",
    // a. Repeat for each element k of keys,
    for (let k of keys) {
      // i. Let currentDesc be ? O.[[GetOwnProperty]](k).
      let currentDesc = O.$GetOwnProperty(k);

      // ii. If currentDesc is not undefined, then
      if (currentDesc) {
        Properties.ThrowIfMightHaveBeenDeleted(currentDesc.value);
        let desc;

        // 1. If IsAccessorDescriptor(currentDesc) is true, then
        if (IsAccessorDescriptor(realm, currentDesc)) {
          // a. Let desc be the PropertyDescriptor{[[Configurable]]: false}.
          desc = { configurable: false };
        } else {
          // 2. Else,
          // b. Let desc be the PropertyDescriptor { [[Configurable]]: false, [[Writable]]: false }.
          desc = { configurable: false, writable: false };
        }

        // 3. Perform ? DefinePropertyOrThrow(O, k, desc).
        Properties.DefinePropertyOrThrow(realm, O, k, desc);
      }
    }
  }

  // 8. Return true.
  return true;
}

// ECMA262 7.3.15
export function TestIntegrityLevel(realm: Realm, O: ObjectValue, level: IntegrityLevels): boolean {
  // 1. Assert: Type(O) is Object.
  invariant(O instanceof ObjectValue, "expected an object");

  // 2. Assert: level is either "sealed" or "frozen".
  invariant(level === "sealed" || level === "frozen", "invalid level");

  // 3. Let status be ? IsExtensible(O).
  let status = IsExtensible(realm, O);

  // 4. If status is true, return false.
  if (status === true) return false;

  // 5. NOTE If the object is extensible, none of its properties are examined.

  // 6. Let keys be ? O.[[OwnPropertyKeys]]().
  let keys = O.$OwnPropertyKeys();

  // 7. Repeat for each element k of keys,
  for (let k of keys) {
    // a. Let currentDesc be ? O.[[GetOwnProperty]](k).
    let currentDesc = O.$GetOwnProperty(k);

    // b. If currentDesc is not undefined, then
    if (currentDesc) {
      Properties.ThrowIfMightHaveBeenDeleted(currentDesc.value);

      // i. If currentDesc.[[Configurable]] is true, return false.
      if (currentDesc.configurable === true) return false;

      // ii. If level is "frozen" and IsDataDescriptor(currentDesc) is true, then
      if (level === "frozen" && IsDataDescriptor(realm, currentDesc) === true) {
        // 1. If currentDesc.[[Writable]] is true, return false.
        if (currentDesc.writable === true) return false;
      }
    }
  }

  // 8. Return true.
  return true;
}
