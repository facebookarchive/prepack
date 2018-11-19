/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { Realm } from "../realm.js";
import { FatalError } from "../errors.js";
import { Value, StringValue, NumberValue, ObjectValue } from "../values/index.js";
import { Create } from "../singletons.js";
import { PropertyDescriptor } from "../descriptors.js";

export default function convert(realm: Realm, val: any): Value {
  if (typeof val === "number") {
    return new NumberValue(realm, val);
  } else if (typeof val === "string") {
    return new StringValue(realm, val);
  } else if (val === null) {
    return realm.intrinsics.null;
  } else if (val === undefined) {
    return realm.intrinsics.undefined;
  } else if (val === true) {
    return realm.intrinsics.true;
  } else if (val === false) {
    return realm.intrinsics.false;
  } else if (Array.isArray(val)) {
    return Create.CreateArrayFromList(realm, val.map(item => convert(realm, item)));
  } else if (typeof val === "object") {
    let obj = new ObjectValue(realm, realm.intrinsics.ObjectPrototype);

    for (let key in val) {
      obj.$DefineOwnProperty(
        key,
        new PropertyDescriptor({
          enumerable: true,
          writable: true,
          configurable: true,
          value: convert(realm, val[key]),
        })
      );
    }

    return obj;
  } else {
    throw new FatalError("need to convert value of type " + typeof val);
  }
}
