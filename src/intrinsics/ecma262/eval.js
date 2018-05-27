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
import { Functions } from "../../singletons.js";

export default function(realm: Realm): NativeFunctionValue {
  // ECMA262 18.2.1
  return new NativeFunctionValue(
    realm,
    "eval",
    "eval",
    1,
    (context, [x]) => {
      // 1. Let evalRealm be the value of the active function object's [[Realm]] internal slot.
      let rcontext = realm.getRunningContext();
      let evalRealm = rcontext.function == null ? realm : rcontext.function.$Realm;

      // 2. Let strictCaller be false.
      let strictCaller = false;

      // 3. Let directEval be false.
      let directEval = false;

      // 4. Return ? PerformEval(x, evalRealm, strictCaller, directEval).
      return Functions.PerformEval(realm, x, evalRealm, strictCaller, directEval);
    },
    false
  );
}
