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
import { ObjectValue, StringValue, AbstractValue, BooleanValue } from "../../values/index.js";
import { To } from "../../singletons.js";

export default function(realm: Realm, obj: ObjectValue): void {
  // ECMA262 19.3.1
  obj.$BooleanData = realm.intrinsics.false;

  const tsTemplateSrc = "('' + A)";

  // ECMA262 19.3.3.3
  obj.defineNativeMethod("toString", 0, context => {
    const target = context instanceof ObjectValue ? context.$BooleanData : context;
    if (target instanceof AbstractValue && target.getType() === BooleanValue) {
      return AbstractValue.createFromTemplate(realm, tsTemplateSrc, StringValue, [target]);
    }
    // 1. Let b be ? thisBooleanValue(this value).
    let b = To.thisBooleanValue(realm, context);

    // 2. If b is true, return "true"; else return "false".
    return new StringValue(realm, b.value ? "true" : "false");
  });

  // ECMA262 19.3.3.4
  obj.defineNativeMethod("valueOf", 0, context => {
    // 1. Return ? thisBooleanValue(this value).
    return To.thisBooleanValue(realm, context);
  });
}
