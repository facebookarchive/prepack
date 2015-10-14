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
import { ToString } from "../../methods/to.js";

export default function (realm: Realm): ObjectValue {
  let obj = new ObjectValue(realm, realm.intrinsics.ObjectPrototype, "console");

  function getString(args) {
    let res = "";
    while (args.length) {
      let next = args.shift();
      let nextString = ToString(realm, next);
      res += nextString;
    }
    return res;
  }
  obj.defineNativeMethod("log", 0, (context, args) => {
    realm.outputToConsole(getString(args));
    return realm.intrinsics.undefined;
  });

  obj.defineNativeMethod("error", 0, (context, args) => {
    realm.outputToConsole("ERROR: " + getString(args));
    return realm.intrinsics.undefined;
  });

  obj.defineNativeMethod("warn", 0, (context, args) => {
    realm.outputToConsole("warn: " + getString(args));
    return realm.intrinsics.undefined;
  });

  return obj;
}
