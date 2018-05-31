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
import { NumberValue } from "../../values/index.js";
import { To } from "../../singletons.js";

export default function(realm: Realm): NativeFunctionValue {
  // ECMA262 18.2.4
  return new NativeFunctionValue(
    realm,
    "parseFloat",
    "parseFloat",
    1,
    (context, [string]) => {
      if (!string) return realm.intrinsics.NaN;

      // 1. Let inputString be ? ToString(string).
      let inputString = To.ToStringPartial(realm, string);

      return new NumberValue(realm, parseFloat(inputString));
    },
    false
  );
}
