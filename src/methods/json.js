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
import { Value, ObjectValue, NumberValue, UndefinedValue, StringValue } from "../values/index.js";
import { Create, To } from "../singletons.js";
import { Get } from "./get.js";
import { Call } from "./call.js";
import { IsArray } from "./is.js";
import { EnumerableOwnProperties } from "./own.js";
import type { PropertyKeyValue } from "../types.js";
import invariant from "../invariant.js";

// ECMA262 24.3.1.1
export function InternalizeJSONProperty(
  realm: Realm,
  reviver: ObjectValue,
  holder: ObjectValue,
  name: PropertyKeyValue
): Value {
  // 1. Let val be ? Get(holder, name).
  let val = Get(realm, holder, name);
  // 2. If Type(val) is Object, then
  if (val instanceof ObjectValue) {
    // a. Let isArray be ? IsArray(val).
    let isArray = IsArray(realm, val);

    // b. If isArray is true, then
    if (isArray === true) {
      // i. Set I to 0.
      let I = 0;

      // ii. Let len be ? ToLength(? Get(val, "length")).
      let len = To.ToLength(realm, Get(realm, val, "length"));

      // iii. Repeat while I < len,
      while (I < len) {
        // 1. Let newElement be ? InternalizeJSONProperty(val, ! ToString(I)).
        let newElement = InternalizeJSONProperty(realm, reviver, val, To.ToString(realm, new NumberValue(realm, I)));

        // 2. If newElement is undefined, then
        if (newElement instanceof UndefinedValue) {
          // a. Perform ? val.[[Delete]](! ToString(I)).
          val.$Delete(To.ToString(realm, new NumberValue(realm, I)));
        } else {
          // 3. Else,
          // a. Perform ? CreateDataProperty(val, ! ToString(I), newElement).
          Create.CreateDataProperty(
            realm,
            val,
            To.ToString(realm, new NumberValue(realm, I)),
            newElement.throwIfNotConcrete()
          );

          // b. NOTE This algorithm intentionally does not throw an exception if CreateDataProperty returns false.
        }

        // 4. Add 1 to I.
        I += 1;
      }
    } else {
      // c. Else,
      // i. Let keys be ? EnumerableOwnProperties(val, "key").
      let keys = EnumerableOwnProperties(realm, val, "key");

      // ii. For each String P in keys do,
      for (let P of keys) {
        invariant(P instanceof StringValue);

        // 1. Let newElement be ? InternalizeJSONProperty(val, P).
        let newElement = InternalizeJSONProperty(realm, reviver, val, P);

        // 2. If newElement is undefined, then
        if (newElement instanceof UndefinedValue) {
          // a. Perform ? val.[[Delete]](P).
          val.$Delete(P);
        } else {
          // 3. Else,
          // a. Perform ? CreateDataProperty(val, P, newElement).
          Create.CreateDataProperty(realm, val, P, newElement);

          // b. NOTE This algorithm intentionally does not throw an exception if CreateDataProperty returns false.
        }
      }
    }
  }

  // 3. Return ? Call(reviver, holder, « name, val »).
  return Call(realm, reviver, holder, [typeof name === "string" ? new StringValue(realm, name) : name, val]);
}
