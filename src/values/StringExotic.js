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
import type { PropertyKeyValue, Descriptor } from "../types.js";
import { ObjectValue, NumberValue, StringValue } from "./index.js";
import { IsInteger, IsArrayIndex } from "../methods/is.js";
import { Properties, To } from "../singletons.js";
import invariant from "../invariant.js";
import { PropertyDescriptor } from "../descriptors.js";

export default class StringExotic extends ObjectValue {
  constructor(realm: Realm, intrinsicName?: string) {
    super(realm, realm.intrinsics.StringPrototype, intrinsicName);
  }

  // ECMA262 9.4.3.1
  $GetOwnProperty(P: PropertyKeyValue): Descriptor | void {
    // 1. Assert: IsPropertyKey(P) is true.

    // 2. Let desc be OrdinaryGetOwnProperty(S, P).
    let desc = Properties.OrdinaryGetOwnProperty(this.$Realm, this, P);

    // 3. If desc is not undefined, return desc.
    if (desc !== undefined) {
      Properties.ThrowIfMightHaveBeenDeleted(desc);
      return desc;
    }

    // 4. If Type(P) is not String, return undefined.
    if (typeof P !== "string" && !(P instanceof StringValue)) return undefined;

    // 5. Let index be ! CanonicalNumericIndexString(P).
    let index = To.CanonicalNumericIndexString(
      this.$Realm,
      typeof P === "string" ? new StringValue(this.$Realm, P) : P
    );

    // 6. If index is undefined, return undefined.
    if (index === undefined || index === null) return undefined;

    // 7. If IsInteger(index) is false, return undefined.
    if (IsInteger(this.$Realm, index) === false) return undefined;

    // 8. If index = -0, return undefined.
    if (1.0 / index === -Infinity) return undefined;

    // 9. Let str be the String value of S.[[StringData]].
    let str = this.$StringData;
    invariant(str);
    str = str.throwIfNotConcreteString();

    // 10. Let len be the number of elements in str.
    let len = str.value.length;

    // 11. If index < 0 or len ≤ index, return undefined.
    if (index < 0 || len <= index) return undefined;

    // 12. Let resultStr be a String value of length 1, containing one code unit from str, specifically the code unit at index index.
    let resultStr = new StringValue(this.$Realm, str.value.charAt(index));

    // 13. Return a PropertyDescriptor{[[Value]]: resultStr, [[Writable]]: false, [[Enumerable]]: true, [[Configurable]]: false}.
    return new PropertyDescriptor({
      value: resultStr,
      writable: false,
      enumerable: true,
      configurable: false,
    });
  }

  // ECMA262 9.4.3.2
  $OwnPropertyKeys(): Array<PropertyKeyValue> {
    // 1. Let keys be a new empty List.
    let keys = [];

    // 2. Let str be the String value of O.[[StringData]].
    let str = this.$StringData;
    invariant(str);
    str = str.throwIfNotConcreteString();

    // 3. Let len be the number of elements in str.
    let len = str.value.length;

    let realm = this.$Realm;
    // 4. For each integer i starting with 0 such that i < len, in ascending order,
    for (let i = 0; i < len; ++i) {
      // a. Add ! ToString(i) as the last element of keys.
      keys.push(new StringValue(realm, To.ToString(realm, new NumberValue(realm, i))));
    }

    // 5. For each own property key P of O such that P is an integer index and ToInteger(P) ≥ len, in ascending numeric index order,
    let properties = Properties.GetOwnPropertyKeysArray(realm, this, false, false);
    for (let key of properties
      .filter(x => IsArrayIndex(realm, x))
      .map(x => parseInt(x, 10))
      .filter(x => To.ToInteger(realm, x) >= len)
      .sort((x, y) => x - y)) {
      // i. Add P as the last element of keys.
      keys.push(new StringValue(realm, key + ""));
    }

    // 6. For each own property key P of O such that Type(P) is String and P is not an integer index, in ascending chronological order of property creation,
    for (let key of properties.filter(x => !IsArrayIndex(realm, x))) {
      // i. Add P as the last element of keys.
      keys.push(new StringValue(realm, key));
    }

    // 7. For each own property key P of O such that Type(P) is Symbol, in ascending chronological order of property creation,
    for (let key of this.symbols.keys()) {
      // i. Add P as the last element of keys.
      keys.push(key);
    }

    // 12. Return keys.
    return keys;
  }
}
