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
import { NativeFunctionValue, BooleanValue } from "../../values/index.js";
import { Create, To } from "../../singletons.js";

export default function(realm: Realm): NativeFunctionValue {
  // ECMA262 19.3.1.1
  let func = new NativeFunctionValue(realm, "Boolean", "Boolean", 1, (context, [value], argCount, NewTarget) => {
    // 1. Let b be ToBoolean(value).
    let b = new BooleanValue(realm, To.ToBooleanPartial(realm, value));

    // 2. If NewTarget is undefined, return b.
    if (!NewTarget) return b;

    // 3. Let O be ? OrdinaryCreateFromConstructor(NewTarget, "%BooleanPrototype%", « [[BooleanData]] »).
    let O = Create.OrdinaryCreateFromConstructor(realm, NewTarget, "BooleanPrototype", { $BooleanData: undefined });

    // 4. Set the value of O's [[BooleanData]] internal slot to b.
    O.$BooleanData = b;

    // 5. Return O.
    return O;
  });

  return func;
}
