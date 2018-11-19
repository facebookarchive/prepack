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
import { ProxyValue, NullValue, NativeFunctionValue } from "../../values/index.js";
import { Create } from "../../singletons.js";
import { ProxyCreate } from "../../methods/proxy.js";
import invariant from "../../invariant.js";

export default function(realm: Realm): NativeFunctionValue {
  // ECMA262 26.2.1.1
  let func = new NativeFunctionValue(realm, "Proxy", "Proxy", 2, (context, [target, handler], argCount, NewTarget) => {
    // 1. If NewTarget is undefined, throw a TypeError exception.
    if (!NewTarget) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 2. Return ? ProxyCreate(target, handler).
    return ProxyCreate(realm, target, handler);
  });

  // ECMA262 26.2.2.1
  func.defineNativeMethod("revocable", 2, (context, [target, handler]) => {
    // 1. Let p be ? ProxyCreate(target, handler).
    let p = ProxyCreate(realm, target, handler);

    // 2. Let revoker be a new built-in function object as defined in 26.2.2.1.1.
    let revoker = createRevoker();

    // 3. Set the [[RevocableProxy]] internal slot of revoker to p.
    revoker.$RevocableProxy = p;

    // 4. Let result be ObjectCreate(%ObjectPrototype%).
    let result = Create.ObjectCreate(realm, realm.intrinsics.ObjectPrototype);

    // 5. Perform CreateDataProperty(result, "proxy", p).
    Create.CreateDataProperty(realm, result, "proxy", p);

    // 6. Perform CreateDataProperty(result, "revoke", revoker).
    Create.CreateDataProperty(realm, result, "revoke", revoker);

    // 7. Return result.
    return result;
  });

  function createRevoker() {
    let F = new NativeFunctionValue(
      realm,
      undefined,
      undefined,
      0,
      (context, [target, handler], argCount, NewTarget) => {
        // 1. Let p be the value of F's [[RevocableProxy]] internal slot.
        let p = F.$RevocableProxy;

        // 2. If p is null, return undefined.
        if (p instanceof NullValue) return realm.intrinsics.undefined;

        // 3. Set the value of F's [[RevocableProxy]] internal slot to null.
        F.$RevocableProxy = realm.intrinsics.null;

        // 4. Assert: p is a Proxy object.
        invariant(p instanceof ProxyValue, "expected proxy");

        // 5. Set the [[ProxyTarget]] internal slot of p to null.
        p.$ProxyTarget = realm.intrinsics.null;

        // 6. Set the [[ProxyHandler]] internal slot of p to null.
        p.$ProxyHandler = realm.intrinsics.null;

        // 7. Return undefined.
        return realm.intrinsics.undefined;
      },
      false
    );

    return F;
  }

  return func;
}
