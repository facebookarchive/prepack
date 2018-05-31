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
import { Create, To } from "../../singletons.js";
import { ValidateTypedArray } from "../../methods/typedarray.js";

export default function(realm: Realm): NativeFunctionValue {
  // ECMA262 22.1.3.30
  return new NativeFunctionValue(realm, "Array.prototype.values", "values", 0, context => {
    // 1. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    // 2. Perform ? ValidateTypedArray(O).
    ValidateTypedArray(realm, O);

    // 3. Return CreateArrayIterator(O, "value").
    return Create.CreateArrayIterator(realm, O.throwIfNotConcreteObject(), "value");
  });
}
