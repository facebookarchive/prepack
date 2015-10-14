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
import { NativeFunctionValue } from "../../values/index.js";
import { ToObjectPartial } from "../../methods/index.js";
import { Get } from "../../methods/get.js";
import { Call } from "../../methods/call.js";
import { IsCallable } from "../../methods/is.js";

export default function (realm: Realm): NativeFunctionValue {
  // ECMA262 22.1.3.30
  return new NativeFunctionValue(realm, "Array.prototype.toString", "toString", 0, (context) => {
    // 1. Let array be ? ToObject(this value).
    let array = ToObjectPartial(realm, context);

    // 2. Let func be ? Get(array, "join").
    let func = Get(realm, array, "join");

    // 3. If IsCallable(func) is false, let func be the intrinsic function %ObjProto_toString%.
    if (!IsCallable(realm, func))
     func = realm.intrinsics.ObjectProto_toString;

    // 4. Return ? Call(func, array).
    return Call(realm, func, array);
  }, false);
}
