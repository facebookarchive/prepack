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
  // ECMA262 18.2.6.4
  let name = "encodeURI";
  return new NativeFunctionValue(realm, name, name, 1, (context, [_uri], argCount, NewTarget) => {
    let uri = _uri;
    if (NewTarget) throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, `${name} is not a constructor`);

    uri = uri.throwIfNotConcrete();
    // 1. Let uriString be ? ToString(uri).
    let uriString = To.ToString(realm, uri);
    // 2. Let unescapedURISet be a String containing one instance of each code unit valid in uriReserved and uriUnescaped plus "#".
    // 3. Return ? Encode(uriString, unescapedURISet).
    try {
      return new StringValue(realm, encodeURI(uriString));
    } catch (e) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.URIError, e.message);
    }
  });
}
