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
  // ECMA262 18.2.6.5
  let name = "encodeURIComponent";
  return new NativeFunctionValue(realm, name, name, 1, (context, [_uriComponent], argCount, NewTarget) => {
    let uriComponent = _uriComponent;
    if (NewTarget) throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, `${name} is not a constructor`);

    uriComponent = uriComponent.throwIfNotConcrete();

    // 1. Let componentString be ? ToString(uri).
    let componentString = To.ToString(realm, uriComponent);

    // 2. Let unescapedURIComponentSet be a String containing one instance of each code unit valid in uriUnescaped.
    // 3. Return ? Encode(componentString, unescapedURIComponentSet).
    try {
      return new StringValue(realm, encodeURIComponent(componentString));
    } catch (e) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.URIError, e.message);
    }
  });
}
