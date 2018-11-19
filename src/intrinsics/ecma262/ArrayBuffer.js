/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import type { Realm } from "../../realm.js";
import { NativeFunctionValue } from "../../values/index.js";
import { To } from "../../singletons.js";
import { AllocateArrayBuffer } from "../../methods/arraybuffer.js";

export default function(realm: Realm): NativeFunctionValue {
  // ECMA262 24.1.2.1
  let func = new NativeFunctionValue(
    realm,
    "ArrayBuffer",
    "ArrayBuffer",
    1,
    (context, [length], argCount, NewTarget) => {
      // 1. If NewTarget is undefined, throw a TypeError exception.
      if (!NewTarget) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
      }

      // 2. Let byteLength be ToIndex(numberLength).
      let byteLength = To.ToIndexPartial(realm, length);

      // 3. Return ? AllocateArrayBuffer(NewTarget, byteLength).
      return AllocateArrayBuffer(realm, NewTarget, byteLength);
    }
  );

  // ECMA262 24.1.3.1
  func.defineNativeMethod("isView", 1, (context, [_arg]) => {
    let arg = _arg;
    // 1. If Type(arg) is not Object, return false.
    if (!arg.mightBeObject()) return realm.intrinsics.false;

    // 2. If arg has a [[ViewedArrayBuffer]] internal slot, return true.
    arg = arg.throwIfNotConcreteObject();
    if ("$ViewedArrayBuffer" in arg) return realm.intrinsics.true;

    // 3. Return false.
    return realm.intrinsics.false;
  });

  // ECMA262 24.1.3.3
  func.defineNativeGetter(realm.intrinsics.SymbolSpecies, context => {
    // 1. Return the this value
    return context;
  });

  return func;
}
