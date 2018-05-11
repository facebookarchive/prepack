/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { Realm } from "../realm.js";
import type { PropertyKeyValue, Descriptor, ObjectKind } from "../types.js";
import { AbstractValue, ObjectValue, StringValue, NumberValue, Value } from "./index.js";
import { IsAccessorDescriptor, IsPropertyKey, IsArrayIndex } from "../methods/is.js";
import { Properties, To } from "../singletons.js";
import invariant from "../invariant.js";
import type { BabelNodeExpression } from "babel-types";

export default class ArrayValue extends ObjectValue {
  constructor(realm: Realm, intrinsicName?: string) {
    super(realm, realm.intrinsics.ArrayPrototype, intrinsicName);
  }

  getKind(): ObjectKind {
    return "Array";
  }

  isSimpleObject(): boolean {
    return this.$TypedArrayName === undefined;
  }

  // ECMA262 9.4.2.1
  $DefineOwnProperty(P: PropertyKeyValue, Desc: Descriptor): boolean {
    let A = this;

    // 1. Assert: IsPropertyKey(P) is true.
    invariant(IsPropertyKey(this.$Realm, P), "expected a property key");

    // 2. If P is "length", then
    if (P === "length" || (P instanceof StringValue && P.value === "length")) {
      // a. Return ? ArraySetLength(A, Desc).
      return Properties.ArraySetLength(this.$Realm, A, Desc);
    } else if (IsArrayIndex(this.$Realm, P)) {
      // 3. Else if P is an array index, then

      // a. Let oldLenDesc be OrdinaryGetOwnProperty(A, "length").
      let oldLenDesc = Properties.OrdinaryGetOwnProperty(this.$Realm, A, "length");

      // b. Assert: oldLenDesc will never be undefined or an accessor descriptor because Array objects are
      //    created with a length data property that cannot be deleted or reconfigured.
      invariant(
        oldLenDesc !== undefined && !IsAccessorDescriptor(this.$Realm, oldLenDesc),
        "cannot be undefined or an accessor descriptor"
      );
      Properties.ThrowIfMightHaveBeenDeleted(oldLenDesc.value);

      // c. Let oldLen be oldLenDesc.[[Value]].
      let oldLen = oldLenDesc.value;
      invariant(oldLen instanceof Value);
      oldLen = oldLen.throwIfNotConcrete();
      invariant(oldLen instanceof NumberValue, "expected number value");
      oldLen = oldLen.value;

      // d. Let index be ! ToUint32(P).
      let index = To.ToUint32(this.$Realm, typeof P === "string" ? new StringValue(this.$Realm, P) : P);

      // e. If index ≥ oldLen and oldLenDesc.[[Writable]] is false, return false.
      if (index >= oldLen && oldLenDesc.writable === false) return false;

      // f. Let succeeded be ! OrdinaryDefineOwnProperty(A, P, Desc).
      let succeeded = Properties.OrdinaryDefineOwnProperty(this.$Realm, A, P, Desc);

      // g. If succeeded is false, return false.
      if (succeeded === false) return false;

      // h. If index ≥ oldLen, then
      if (index >= oldLen) {
        // i. Set oldLenDesc.[[Value]] to index + 1.
        oldLenDesc.value = new NumberValue(this.$Realm, index + 1);

        // ii. Let succeeded be OrdinaryDefineOwnProperty(A, "length", oldLenDesc).
        succeeded = Properties.OrdinaryDefineOwnProperty(this.$Realm, A, "length", oldLenDesc);

        // iii. Assert: succeeded is true.
        invariant(succeeded, "expected length definition to succeed");
      }

      // i. Return true.
      return true;
    }

    // 1. Return OrdinaryDefineOwnProperty(A, P, Desc).
    return Properties.OrdinaryDefineOwnProperty(this.$Realm, A, P, Desc);
  }

  static createTemporalWithWidenedNumericProperty(
    realm: Realm,
    args: Array<Value>,
    buildFunction: (Array<BabelNodeExpression>) => BabelNodeExpression,
    reactArrayHint?: { func: Value, thisVal: Value }
  ): ArrayValue {
    invariant(realm.generator !== undefined);

    let value = realm.generator.deriveConcrete(
      intrinsicName => new ArrayValue(realm, intrinsicName),
      args,
      buildFunction,
      { isPure: true }
    );

    invariant(value instanceof ArrayValue);
    // Add unknownProperty so we manually handle this object property access
    value.unknownProperty = {
      key: undefined,
      descriptor: {
        value: AbstractValue.createFromType(realm, Value, "widened numeric property"),
      },
      object: value,
    };
    if (realm.react.enabled && reactArrayHint !== undefined) {
      realm.react.arrayHints.set(value, reactArrayHint);
    }
    return value;
  }

  static isIntrinsicAndHasWidenedNumericProperty(obj: Value): boolean {
    if (obj instanceof ArrayValue && obj.intrinsicName) {
      const prop = obj.unknownProperty;
      if (prop !== undefined && prop.descriptor !== undefined) {
        const desc = prop.descriptor;

        return desc.value instanceof AbstractValue && desc.value.kind === "widened numeric property";
      }
    }
    return false;
  }
}
