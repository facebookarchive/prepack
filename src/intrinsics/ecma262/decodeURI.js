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
import { StringValue } from "../../values/index.js";
import { To } from "../../singletons.js";

export default function(realm: Realm): NativeFunctionValue {
  // ECMA262 18.2.6.2
  let name = "decodeURI";
  return new NativeFunctionValue(realm, name, name, 1, (context, [_encodedURI], argCount, NewTarget) => {
    let encodedURI = _encodedURI;
    if (NewTarget) throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, `${name} is not a constructor`);

    encodedURI = encodedURI.throwIfNotConcrete();
    // 1. Let uriString be ? ToString(encodedURI).
    let uriString = To.ToString(realm, encodedURI);
    // 2. Let reservedURISet be a String containing one instance of each code unit valid in uriReserved plus "#".
    // 3. Return ? Decode(uriString, reservedURISet).
    try {
      return new StringValue(realm, decodeURI(uriString));
    } catch (e) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.URIError, e.message);
    }
  });
}
