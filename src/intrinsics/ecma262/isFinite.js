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

export default function(realm: Realm): NativeFunctionValue {
  // ECMA262 18.2.2
  return new NativeFunctionValue(
    realm,
    "isFinite",
    "isFinite",
    1,
    (context, [number]) => {
      // 1. Let num be ? ToNumber(number).
      let num = To.ToNumber(realm, number);

      // 2. If num is NaN, +∞, or -∞, return false.
      if (isNaN(num) || num === +Infinity || num === -Infinity) return realm.intrinsics.false;

      // 3. Otherwise, return true.
      return realm.intrinsics.true;
    },
    false
  );
}
