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
import { AbstractValue, ArrayValue, NativeFunctionValue, StringValue } from "../../values/index.js";
import { To } from "../../singletons.js";
import { Get } from "../../methods/get.js";
import { Call } from "../../methods/call.js";
import { IsCallable } from "../../methods/is.js";
import { createOperationDescriptor } from "../../utils/generator.js";

export default function(realm: Realm): NativeFunctionValue {
  // ECMA262 22.1.3.30
  return new NativeFunctionValue(
    realm,
    "Array.prototype.toString",
    "toString",
    0,
    context => {
      // 1. Let array be ? ToObject(this value).
      let array = To.ToObject(realm, context);

      // If we have an object that is an array with widened numeric properties, then
      // we can return a temporal here as we know nothing of the array's properties.
      // This should be safe to do, as we never expose the internals of the array.
      if (
        ArrayValue.isIntrinsicAndHasWidenedNumericProperty(array) &&
        realm.isInPureScope() &&
        array.$GetOwnProperty("toString") === undefined
      ) {
        return AbstractValue.createTemporalFromBuildFunction(
          realm,
          StringValue,
          [array, new StringValue(realm, "toString")],
          createOperationDescriptor("UNKNOWN_ARRAY_METHOD_PROPERTY_CALL")
        );
      }

      // 2. Let func be ? Get(array, "join").
      let func = Get(realm, array, "join");

      // 3. If IsCallable(func) is false, let func be the intrinsic function %ObjProto_toString%.
      if (!IsCallable(realm, func)) func = realm.intrinsics.ObjectProto_toString;

      // 4. Return ? Call(func, array).
      return Call(realm, func, array);
    },
    false
  );
}
