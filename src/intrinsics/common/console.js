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
import { ObjectValue } from "../../values/index.js";

const consoleMethods = [
  "assert",
  "clear",
  "count",
  "dir",
  "dirxml",
  "error",
  "group",
  "groupCollapsed",
  "groupEnd",
  "info",
  "log",
  "table",
  "time",
  "timeEnd",
  "trace",
  "warn",
];

export default function(realm: Realm): ObjectValue {
  let obj = new ObjectValue(realm, realm.intrinsics.ObjectPrototype, "console");

  for (let method of consoleMethods) {
    obj.defineNativeMethod(method, 0, (context, args) => {
      realm.outputToConsole(method, args);
      return realm.intrinsics.undefined;
    });
  }

  obj.defineNativeMethod("time", 0, (context, args) => {
    realm.outputToConsole("time", args);
    return realm.intrinsics.undefined;
  });

  obj.defineNativeMethod("timeEnd", 0, (context, args) => {
    realm.outputToConsole("timeEnd", args);
    return realm.intrinsics.undefined;
  });

  return obj;
}
