/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import invariant from "../../invariant.js";
import { FatalError } from "../../errors.js";
import type { Realm } from "../../realm.js";
import { type Value, BooleanValue, ObjectValue, NumberValue, StringValue } from "../../values/index.js";
import { Properties } from "../../singletons.js";

export function getNodeBufferFromTypedArray(realm: Realm, value: ObjectValue): Uint8Array {
  let buffer = value.$ViewedArrayBuffer;
  invariant(buffer instanceof ObjectValue && buffer.$ArrayBufferData);
  return buffer.$ArrayBufferData;
}

// Takes a value from the host realm and create it into a Prepack Realm.
// TODO: Move this to a bigger general purpose proxy between the environments.
// See issue #644 for more details.
export function createDeepIntrinsic(realm: Realm, value: mixed, intrinsicName: string): Value {
  switch (typeof value) {
    case "undefined":
      return realm.intrinsics.undefined;
    case "boolean":
      return new BooleanValue(realm, value, intrinsicName);
    case "number":
      return new NumberValue(realm, value, intrinsicName);
    case "string":
      return new StringValue(realm, value, intrinsicName);
    // $FlowFixMe flow doesn't understand symbols.
    case "symbol":
      throw new FatalError("Symbol cannot be safely cloned.");
    case "function":
      throw new FatalError("Functions could be supported but are not yet.");
    case "object": {
      if (value === null) {
        return realm.intrinsics.null;
      }
      if (Array.isArray(value)) {
        throw new FatalError("Arrays are not supported yet.");
      }
      let prototype = Object.getPrototypeOf(value);
      if (prototype !== (Object: any).prototype) {
        throw new FatalError(
          "Only simple objects are supported for now. Got: " +
            ((typeof (prototype: any).constructor === "function" && prototype.constructor.name) ||
              Object.prototype.toString.call(prototype))
        );
      }
      let obj = new ObjectValue(
        realm,
        realm.intrinsics.ObjectPrototype,
        intrinsicName // We use the intrinsic name for Objects to preserve their referential equality
      );
      let names = Object.getOwnPropertyNames(value);
      for (let name of names) {
        // We intentionally invoke the getter on value[name] which resolves any
        // lazy getters.
        let newValue = createDeepIntrinsic(realm, value[name], intrinsicName + "." + name);
        copyProperty(realm, value, obj, name, newValue);
      }
      return obj;
    }
    default:
      invariant(false);
  }
}

// Define a value with the same descriptor settings as the original object.
export function copyProperty(realm: Realm, originalObject: {}, realmObject: ObjectValue, name: string, value: Value) {
  let desc = Object.getOwnPropertyDescriptor(originalObject, name);
  if (!desc) {
    return;
  }
  if (desc.get || desc.set) {
    throw new FatalError("Getter/setters are not supported because functions are not supported yet.");
  }
  let newDesc = {
    value: value,
    writable: !!desc.writable,
    configurable: !!desc.configurable,
    enumerable: !!desc.enumerable,
  };
  Properties.DefinePropertyOrThrow(realm, realmObject, name, newDesc);
}
