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
import { ObjectValue, Value } from "./index.js";
import { IsDataDescriptor, IsAccessorDescriptor } from "../methods/is.js";
import { HasOwnProperty } from "../methods/has.js";
import { SameValuePartial } from "../methods/abstract.js";
import { Get, OrdinaryGet } from "../methods/get.js";
import { Properties } from "../singletons.js";
import invariant from "../invariant.js";
import { PropertyDescriptor } from "../descriptors.js";

export default class ArgumentsExotic extends ObjectValue {
  constructor(realm: Realm, intrinsicName?: string) {
    super(realm, realm.intrinsics.ObjectPrototype, intrinsicName);
  }

  $ParameterMap: void | ObjectValue;

  // ECMA262 9.4.4.1
  $GetOwnProperty(P: PropertyKeyValue): Descriptor | void {
    // 1. Let args be the arguments object.
    let args = this;

    // 2. Let desc be OrdinaryGetOwnProperty(args, P).
    let desc = Properties.OrdinaryGetOwnProperty(this.$Realm, args, P);

    // 3. If desc is undefined, return desc.
    if (desc === undefined) return undefined;
    Properties.ThrowIfMightHaveBeenDeleted(desc);
    desc = desc.throwIfNotConcrete(this.$Realm);

    // 4. Let map be args.[[ParameterMap]].
    let map = args.$ParameterMap;
    invariant(map);

    // 5. Let isMapped be ! HasOwnProperty(map, P).
    let isMapped = HasOwnProperty(this.$Realm, map, P);

    // 6. If isMapped is true, then
    if (isMapped === true) {
      // a. Set desc.[[Value]] to Get(map, P).
      desc.value = Get(this.$Realm, map, P);
    }

    // 7. Return desc.
    return desc;
  }

  // ECMA262 9.4.4.2
  $DefineOwnProperty(P: PropertyKeyValue, _Desc: Descriptor): boolean {
    let Desc = _Desc.throwIfNotConcrete(this.$Realm);

    // 1. Let args be the arguments object.
    let args = this;

    // 2. Let map be args.[[ParameterMap]].
    let map = args.$ParameterMap;
    invariant(map);

    // 3. Let isMapped be HasOwnProperty(map, P).
    let isMapped = HasOwnProperty(this.$Realm, map, P);

    // 4. Let newArgDesc be Desc.
    let newArgDesc = Desc;

    // 5. If isMapped is true and IsDataDescriptor(Desc) is true, then
    if (isMapped === true && IsDataDescriptor(this.$Realm, Desc) === true) {
      // a. If Desc.[[Value]] is not present and Desc.[[Writable]] is present and its value is false, then
      if (Desc.value === undefined && Desc.writable === false) {
        // i. Let newArgDesc be a copy of Desc.
        newArgDesc = new PropertyDescriptor(Desc);

        // ii. Set newArgDesc.[[Value]] to Get(map, P).
        newArgDesc.value = Get(this.$Realm, map, P);
      }
    }

    // 6. Let allowed be ? OrdinaryDefineOwnProperty(args, P, newArgDesc).
    let allowed = Properties.OrdinaryDefineOwnProperty(this.$Realm, args, P, newArgDesc);

    // 7. If allowed is false, return false.
    if (allowed === false) return false;

    // 8. If isMapped is true, then
    if (isMapped === true) {
      // a. If IsAccessorDescriptor(Desc) is true, then
      if (IsAccessorDescriptor(this.$Realm, Desc) === true) {
        // i. Call map.[[Delete]](P).
        map.$Delete(P);
      } else {
        // b. Else,
        // i. If Desc.[[Value]] is present, then
        if (Desc.value !== undefined) {
          // 1. Let setStatus be Set(map, P, Desc.[[Value]], false).
          invariant(Desc.value instanceof Value);
          let setStatus = Properties.Set(this.$Realm, map, P, Desc.value, false);

          // 2. Assert: setStatus is true because formal parameters mapped by argument objects are always writable.
          invariant(setStatus === true);
        }

        // ii. If Desc.[[Writable]] is present and its value is false, then
        if (Desc.writable === false) {
          // 1. Call map.[[Delete]](P).
          map.$Delete(P);
        }
      }
    }

    // 9. Return true.
    return true;
  }

  // ECMA262 9.4.4.3
  $Get(P: PropertyKeyValue, Receiver: Value): Value {
    // 1. Let args be the arguments object.
    let args = this;

    // 2. Let map be args.[[ParameterMap]].
    let map = args.$ParameterMap;
    invariant(map);

    // 3. Let isMapped be ! HasOwnProperty(map, P).
    let isMapped = HasOwnProperty(this.$Realm, map, P);

    // 4. If isMapped is false, then
    if (isMapped === false) {
      // a. Return ? OrdinaryGet(args, P, Receiver).
      return OrdinaryGet(this.$Realm, args, P, Receiver);
    } else {
      // 5. Else map contains a formal parameter mapping for P,
      // b. Return Get(map, P).
      return Get(this.$Realm, map, P);
    }
  }

  // ECMA262 9.4.4.4
  $Set(P: PropertyKeyValue, V: Value, Receiver: Value): boolean {
    // 1. Let args be the arguments object.
    let args = this;

    let isMapped, map;
    // 2. If SameValue(args, Receiver) is false, then
    if (SameValuePartial(this.$Realm, args, Receiver) === false) {
      // a. Let isMapped be false.
      isMapped = false;
    } else {
      // 3. Else,
      // a. Let map be args.[[ParameterMap]].
      map = args.$ParameterMap;
      invariant(map);

      // b. Let isMapped be ! HasOwnProperty(map, P).
      isMapped = HasOwnProperty(this.$Realm, map, P);
    }

    // 4. If isMapped is true, then
    if (isMapped === true) {
      invariant(map);
      // a. Let setStatus be Set(map, P, V, false).
      let setStatus = Properties.Set(this.$Realm, map, P, V, false);

      // b. Assert: setStatus is true because formal parameters mapped by argument objects are always writable.
      invariant(setStatus === true);
    }

    // 5. Return ? OrdinarySet(args, P, V, Receiver).
    return Properties.OrdinarySet(this.$Realm, args, P, V, Receiver);
  }

  // ECMA262 9.4.4.5
  $Delete(P: PropertyKeyValue): boolean {
    // 1. Let args be the arguments object.
    let args = this;

    // 2. Let map be args.[[ParameterMap]].
    let map = args.$ParameterMap;
    invariant(map);

    // 3. Let isMapped be ! HasOwnProperty(map, P).
    let isMapped = HasOwnProperty(this.$Realm, map, P);

    // 4. Let result be ? OrdinaryDelete(args, P).
    let result = Properties.OrdinaryDelete(this.$Realm, args, P);

    // 5. If result is true and isMapped is true, then
    if (result === true && isMapped === true) {
      // a. Call map.[[Delete]](P).
      map.$Delete(P);
    }

    // 6. Return result.
    return result;
  }
}
