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
import { AbstractValue, ArrayValue, NativeFunctionValue, StringValue, Value } from "../../values/index.js";
import { Create, To } from "../../singletons.js";
import { createOperationDescriptor } from "../../utils/generator.js";

export default function(realm: Realm): NativeFunctionValue {
  // ECMA262 22.1.3.30
  return new NativeFunctionValue(realm, "Array.prototype.values", "values", 0, context => {
    // 1. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    // If we have an object that is an array with widened numeric properties, then
    // we can return a temporal here as we know nothing of the array's properties.
    // This should be safe to do, as we never expose the internals of the array.
    if (
      ArrayValue.isIntrinsicAndHasWidenedNumericProperty(O) &&
      realm.isInPureScope() &&
      O.$GetOwnProperty("values") === undefined
    ) {
      return AbstractValue.createTemporalFromBuildFunction(
        realm,
        Value,
        [O, new StringValue(realm, "values")],
        createOperationDescriptor("UNKNOWN_ARRAY_METHOD_PROPERTY_CALL")
      );
    }

    // 2. Return CreateArrayIterator(O, "value").
    return Create.CreateArrayIterator(realm, O.throwIfNotConcreteObject(), "value");
  });
}
