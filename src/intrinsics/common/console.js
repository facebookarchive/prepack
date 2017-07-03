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
import { ObjectValue } from "../../values/index.js";

export default function(realm: Realm): ObjectValue {
  let obj = new ObjectValue(realm, realm.intrinsics.ObjectPrototype, "console");

  obj.defineNativeMethod("log", 0, (context, args) => {
    realm.outputToConsole("log", args);
    return realm.intrinsics.undefined;
  });

  obj.defineNativeMethod("error", 0, (context, args) => {
    realm.outputToConsole("error", args);
    return realm.intrinsics.undefined;
  });

  obj.defineNativeMethod("warn", 0, (context, args) => {
    realm.outputToConsole("warn", args);
    return realm.intrinsics.undefined;
  });

  return obj;
}
