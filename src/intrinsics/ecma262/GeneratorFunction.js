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
import { CreateDynamicFunction } from "../../methods/create.js";

export default function (realm: Realm): NativeFunctionValue {
  // ECMA262 25.2.1
  let func = new NativeFunctionValue(realm, "GeneratorFunction", "GeneratorFunction", 1, (context, args, argCount, NewTarget) => {
    // 1. Let C be the active function object.
    let C = func;

    // 2. Let args be the argumentsList that was passed to this function by [[Call]] or [[Construct]].
    args = argCount > 0 ? args : [];

    // 3. Return ? CreateDynamicFunction(C, NewTarget, "generator", args).
    return CreateDynamicFunction(realm, C, NewTarget, "generator", args);
  });

  return func;
}
