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
import { PropertyDescriptor } from "../../descriptors.js";

export default function(realm: Realm): NativeFunctionValue {
  // ECMA262 9.2.7.1
  let func = new NativeFunctionValue(realm, "(function() { throw new TypeError(); })", "", 0, context => {
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
  });

  // ECMA262 9.2.7.1
  func.setExtensible(false);

  // ECMA262 9.2.7.1
  func.$DefineOwnProperty(
    "length",
    new PropertyDescriptor({
      value: realm.intrinsics.zero,
      writable: false,
      configurable: false,
      enumerable: false,
    })
  );

  return func;
}
