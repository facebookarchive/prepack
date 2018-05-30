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
import { AbstractValue, ArrayValue, NativeFunctionValue, Value } from "../../values/index.js";
import { Create, To } from "../../singletons.js";
import * as t from "babel-types";

export default function(realm: Realm): NativeFunctionValue {
  // ECMA262 22.1.3.30
  return new NativeFunctionValue(realm, "Array.prototype.values", "values", 0, context => {
    // 1. Let O be ? ToObject(this value).
    let O = To.ToObject(realm, context);

    // If we have an object that is an unknown array with numeric properties, then
    // we can return a temporal here as we know nothing of the array's properties.
    // This should be safe to do, as we never expose the internals of the array.
    if (ArrayValue.isIntrinsicAndHasWidenedNumericProperty(O) && realm.isInPureScope()) {
      return AbstractValue.createTemporalFromBuildFunction(realm, Value, [O], ([objNode]) =>
        t.callExpression(t.memberExpression(objNode, t.identifier("values")), [])
      );
    }

    // 2. Return CreateArrayIterator(O, "value").
    return Create.CreateArrayIterator(realm, O.throwIfNotConcreteObject(), "value");
  });
}
