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
import { ObjectValue, NativeFunctionValue, Value } from "../../values/index.js";
import { Get } from "../../methods/index.js";
import invariant from "../../invariant.js";

export function updateIntrinsicNames(
  realm: Realm,
  obj: ObjectValue,
  requireName: string,
  properties?: Array<string | { name: string, updatePrototype: boolean }>
): void {
  obj.intrinsicName = `require("${requireName}")`;
  if (properties) {
    for (let property of properties) {
      if (typeof property === "string") {
        let val = Get(realm, obj, property);
        invariant(val instanceof Value);
        val.intrinsicName = `require("${requireName}").${property}`;
      } else if (typeof property === "object" && property !== null) {
        let { name, updatePrototype } = property;

        let val = Get(realm, obj, name);
        invariant(val instanceof Value);
        val.intrinsicName = `require("${requireName}").${name}`;
        if (updatePrototype) {
          invariant(val instanceof ObjectValue);
          let proto = Get(realm, val, "prototype");
          proto.intrinsicName = `require("${requireName}").${name}.prototype`;
        }
      }
    }
  }
}

export function addMockFunctionToObject(
  realm: Realm,
  obj: ObjectValue,
  requireName: string,
  funcName: string,
  func: (funcValue: NativeFunctionValue, args: Array<Value>) => Value
): void {
  let funcValue = new NativeFunctionValue(realm, undefined, funcName, 0, (context, args) => func(funcValue, args));

  obj.defineNativeProperty(funcName, funcValue, {
    writable: false,
    enumerable: false,
    configurable: true,
  });
  funcValue.intrinsicName = `require("${requireName}").${funcName}`;
}
