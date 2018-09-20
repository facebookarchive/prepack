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
import { ObjectValue, NumberValue, StringValue, Value, UndefinedValue } from "./index.js";
import { IsInteger, IsArrayIndex, IsAccessorDescriptor, IsDetachedBuffer, IsPropertyKey } from "../methods/is.js";
import { OrdinaryGet } from "../methods/get.js";
import { OrdinaryHasProperty } from "../methods/has.js";
import { IntegerIndexedElementSet, IntegerIndexedElementGet } from "../methods/typedarray.js";
import { Properties, To } from "../singletons.js";
import invariant from "../invariant.js";
import { PropertyDescriptor } from "../descriptors.js";

export default class IntegerIndexedExotic extends ObjectValue {
  constructor(realm: Realm, intrinsicName?: string) {
    super(realm, realm.intrinsics.ObjectPrototype, intrinsicName);
  }

  // ECMA262 9.4.5.1
  $GetOwnProperty(P: PropertyKeyValue): Descriptor | void {
    let O = this;

    // 1. Assert: IsPropertyKey(P) is true.
    invariant(IsPropertyKey(this.$Realm, P), "IsPropertyKey(P) is true");

    // 2. Assert: O is an Object that has a [[ViewedArrayBuffer]] internal slot.
    invariant(O instanceof ObjectValue && O.$ViewedArrayBuffer);

    // 3. If Type(P) is String, then
    if (typeof P === "string" || P instanceof StringValue) {
      // a. Let numericIndex be ! CanonicalNumericIndexString(P).
      let numericIndex = To.CanonicalNumericIndexString(
        this.$Realm,
        typeof P === "string" ? new StringValue(this.$Realm, P) : P
      );

      // b. If numericIndex is not undefined, then
      if (numericIndex !== undefined) {
        // i. Let value be ? IntegerIndexedElementGet(O, numericIndex).
        let value = IntegerIndexedElementGet(this.$Realm, O, numericIndex);

        // ii. If value is undefined, return undefined.
        if (value instanceof UndefinedValue) return undefined;

        // iii. Return a PropertyDescriptor{[[Value]]: value, [[Writable]]: true, [[Enumerable]]: true, [[Configurable]]: false}.
        return new PropertyDescriptor({
          value: value,
          writable: true,
          enumerable: true,
          configurable: false,
        });
      }
    }
    // 4. Return OrdinaryGetOwnProperty(O, P).
    return Properties.OrdinaryGetOwnProperty(this.$Realm, O, P);
  }

  // ECMA262 9.4.5.2
  $HasProperty(P: PropertyKeyValue): boolean {
    let O = this;

    // 1. Assert: IsPropertyKey(P) is true.
    invariant(IsPropertyKey(this.$Realm, P), "IsPropertyKey(P) is true");

    // 2. Assert: O is an Object that has a [[ViewedArrayBuffer]] internal slot.
    invariant(O instanceof ObjectValue && O.$ViewedArrayBuffer);

    // 3. If Type(P) is String, then
    if (typeof P === "string" || P instanceof StringValue) {
      // a. Let numericIndex be ! CanonicalNumericIndexString(P).
      let numericIndex = To.CanonicalNumericIndexString(
        this.$Realm,
        typeof P === "string" ? new StringValue(this.$Realm, P) : P
      );

      // b. If numericIndex is not undefined, then
      if (numericIndex !== undefined) {
        // i. Let buffer be O.[[ViewedArrayBuffer]].
        let buffer = O.$ViewedArrayBuffer;
        invariant(buffer);

        // ii. If IsDetachedBuffer(buffer) is true, throw a TypeError exception.
        if (IsDetachedBuffer(this.$Realm, buffer) === true) {
          throw this.$Realm.createErrorThrowCompletion(
            this.$Realm.intrinsics.TypeError,
            "IsDetachedBuffer(buffer) is true"
          );
        }

        // iii. If IsInteger(numericIndex) is false, return false.
        if (IsInteger(this.$Realm, numericIndex) === false) return false;

        // iv. If numericIndex = -0, return false.
        if (Object.is(numericIndex, -0)) return false;

        // v. If numericIndex < 0, return false.
        if (numericIndex < 0) return false;

        // vi. If numericIndex ≥ O.[[ArrayLength]], return false.
        invariant(O.$ArrayLength !== undefined);
        if (numericIndex >= O.$ArrayLength) return false;

        // vii. Return true.
        return true;
      }
    }

    // 4. Return ? OrdinaryHasProperty(O, P).
    return OrdinaryHasProperty(this.$Realm, O, P);
  }

  // ECMA262 9.4.5.3
  $DefineOwnProperty(P: PropertyKeyValue, _Desc: Descriptor): boolean {
    let O = this;

    // 1. Assert: IsPropertyKey(P) is true.
    invariant(IsPropertyKey(this.$Realm, P), "IsPropertyKey(P) is true");

    // 2. Assert: O is an Object that has a [[ViewedArrayBuffer]] internal slot.
    invariant(O instanceof ObjectValue && this.$ViewedArrayBuffer);

    // 3. If Type(P) is String, then
    if (typeof P === "string" || P instanceof StringValue) {
      // a. Let numericIndex be ! CanonicalNumericIndexString(P).
      let numericIndex = To.CanonicalNumericIndexString(
        this.$Realm,
        typeof P === "string" ? new StringValue(this.$Realm, P) : P
      );

      // b. If numericIndex is not undefined, then
      if (numericIndex !== undefined) {
        // i. If IsInteger(numericIndex) is false, return false.
        if (IsInteger(this.$Realm, numericIndex) === false) return false;

        // ii. If numericIndex = -0, return false.
        if (Object.is(numericIndex, -0)) return false;

        // iii. If numericIndex < 0, return false.
        if (numericIndex < 0) return false;

        // iv. Let length be O.[[ArrayLength]].
        let length = this.$ArrayLength;
        invariant(typeof length === "number");

        // v. If numericIndex ≥ length, return false.
        if (numericIndex >= length) return false;

        let Desc = _Desc.throwIfNotConcrete(this.$Realm);

        // vi. If IsAccessorDescriptor(Desc) is true, return false.
        if (IsAccessorDescriptor(this.$Realm, Desc) === true) return false;

        // vii. If Desc has a [[Configurable]] field and if Desc.[[Configurable]] is true, return false.
        if (Desc.configurable === true) return false;

        // viii. If Desc has an [[Enumerable]] field and if Desc.[[Enumerable]] is false, return false.
        if (Desc.enumerable === false) return false;

        // ix. If Desc has a [[Writable]] field and if Desc.[[Writable]] is false, return false.
        if (Desc.writable === false) return false;

        // x. If Desc has a [[Value]] field, then
        if (Desc.value) {
          // 1. Let value be Desc.[[Value]].
          let value = Desc.value;
          invariant(value === undefined || value instanceof Value);

          // 2. Return ? IntegerIndexedElementSet(O, numericIndex, value).
          return IntegerIndexedElementSet(this.$Realm, O, numericIndex, value);
        }

        // xi. Return true.
        return true;
      }
    }

    // 4. Return ! OrdinaryDefineOwnProperty(O, P, Desc).
    return Properties.OrdinaryDefineOwnProperty(this.$Realm, O, P, _Desc);
  }

  // ECMA262 9.4.5.4
  $Get(P: PropertyKeyValue, Receiver: Value): Value {
    let O = this;

    // 1. Assert: IsPropertyKey(P) is true.
    invariant(IsPropertyKey(this.$Realm, P), "IsPropertyKey(P) is true");

    // 2. If Type(P) is String, then
    if (typeof P === "string" || P instanceof StringValue) {
      // a. Let numericIndex be ! CanonicalNumericIndexString(P).
      let numericIndex = To.CanonicalNumericIndexString(
        this.$Realm,
        typeof P === "string" ? new StringValue(this.$Realm, P) : P
      );

      // b. If numericIndex is not undefined, then
      if (numericIndex !== undefined) {
        // i. Return ? IntegerIndexedElementGet(O, numericIndex).
        return IntegerIndexedElementGet(this.$Realm, O, numericIndex);
      }
    }

    // 3. Return ? OrdinaryGet(O, P, Receiver).
    return OrdinaryGet(this.$Realm, O, P, Receiver);
  }

  // ECMA262 9.4.5.5
  $Set(P: PropertyKeyValue, V: Value, Receiver: Value): boolean {
    let O = this;

    // 1. Assert: IsPropertyKey(P) is true.
    invariant(IsPropertyKey(this.$Realm, P), "IsPropertyKey(P) is true");

    // 2. If Type(P) is String, then
    if (typeof P === "string" || P instanceof StringValue) {
      // a. Let numericIndex be ! CanonicalNumericIndexString(P).
      let numericIndex = To.CanonicalNumericIndexString(
        this.$Realm,
        typeof P === "string" ? new StringValue(this.$Realm, P) : P
      );

      // b. If numericIndex is not undefined, then
      if (numericIndex !== undefined) {
        // i. Return ? IntegerIndexedElementSet(O, numericIndex, V).
        return IntegerIndexedElementSet(this.$Realm, O, numericIndex, V);
      }
    }

    // 3. Return ? OrdinarySet(O, P, V, Receiver).
    return Properties.OrdinarySet(this.$Realm, O, P, V, Receiver);
  }

  // ECMA262 9.4.5.6
  $OwnPropertyKeys(): Array<PropertyKeyValue> {
    let O = this;

    // 1. Let keys be a new empty List.
    let keys = [];

    // 2. Assert: O is an Object that has [[ViewedArrayBuffer]], [[ArrayLength]], [[ByteOffset]], and [[TypedArrayName]] internal slots.
    invariant(
      O instanceof ObjectValue &&
        O.$ViewedArrayBuffer &&
        O.$ArrayLength !== undefined &&
        O.$ByteOffset !== undefined &&
        O.$TypedArrayName
    );

    // 3. Let len be O.[[ArrayLength]].
    let len = O.$ArrayLength;
    invariant(typeof len === "number");

    // 4. For each integer i starting with 0 such that i < len, in ascending order,
    for (let i = 0; i < len; ++i) {
      // a. Add ! ToString(i) as the last element of keys.
      keys.push(new StringValue(this.$Realm, To.ToString(this.$Realm, new NumberValue(this.$Realm, i))));
    }

    let realm = this.$Realm;
    // 5. For each own property key P of O such that Type(P) is String and P is not an integer index, in ascending chronological order of property creation
    let properties = Properties.GetOwnPropertyKeysArray(realm, O, false, false);
    for (let key of properties.filter(x => !IsArrayIndex(realm, x))) {
      // i. Add P as the last element of keys.
      keys.push(new StringValue(realm, key));
    }

    // 6. For each own property key P of O such that Type(P) is Symbol, in ascending chronological order of property creation
    for (let key of O.symbols.keys()) {
      // a. Add P as the last element of keys.
      keys.push(key);
    }

    // 7. Return keys.
    return keys;
  }
}
