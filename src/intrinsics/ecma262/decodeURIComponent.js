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
import { StringValue } from "../../values/index.js";

export default function(realm: Realm): NativeFunctionValue {
  // ECMA262 18.2.6.3
  let name = "decodeURIComponent";
  return new NativeFunctionValue(realm, name, name, 1, (context, [_encodedURIComponent], argCount, NewTarget) => {
    let encodedURIComponent = _encodedURIComponent;
    if (NewTarget) throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, `${name} is not a constructor`);

    encodedURIComponent = encodedURIComponent.throwIfNotConcrete();

    // 1. Let componentString be ? ToString(uri).
    let componentString = To.ToString(realm, encodedURIComponent);

    // 2. Let reservedURIComponentSet be the empty String.
    // 3. Return ? Encode(componentString, unescapedURIComponentSet).
    try {
      return new StringValue(realm, decodeURIComponent(componentString));
    } catch (e) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.URIError, e.message);
    }
  });
}
