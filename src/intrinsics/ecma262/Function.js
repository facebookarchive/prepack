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
import { Create } from "../../singletons.js";

export default function(realm: Realm): NativeFunctionValue {
  // ECMA262 19.2.1
  let func = new NativeFunctionValue(realm, "Function", "Function", 1, (context, _args, argCount, NewTarget) => {
    let args = _args;
    // 1. Let C be the active function object.
    let C = func;

    // 2. Let args be the argumentsList that was passed to this function by [[Call]] or [[Construct]].
    args = argCount > 0 ? args : [];

    // 3. Return ? CreateDynamicFunction(C, NewTarget, "normal", args).
    return Create.CreateDynamicFunction(realm, C, NewTarget, "normal", args);
  });

  return func;
}
