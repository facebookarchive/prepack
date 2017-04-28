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

import { NativeFunctionValue } from "../../values/index.js";
import initializeDocument from "./document.js";
import initializeConsole from "../common/console.js";

export default function (realm: Realm): void {
  let global = realm.$GlobalObject;

  global.$DefineOwnProperty("console", {
    value: initializeConsole(realm),
    writable: true,
    enumerable: false,
    configurable: true
  });

  global.$DefineOwnProperty("self", {
    value: global,
    writable: true,
    enumerable: true,
    configurable: true
  });

  global.$DefineOwnProperty("window", {
    value: global,
    writable: true,
    enumerable: true,
    configurable: true
  });

  global.$DefineOwnProperty("document", {
    value: initializeDocument(realm),
    writable: true,
    enumerable: false,
    configurable: true
  });

  global.$DefineOwnProperty("setTimeout", {
    value: new NativeFunctionValue(realm, "global.setTimeout", "", 2, (context, args) => {
      throw new Error("TODO: implement global.setTimeout");
    }),
    writable: true,
    enumerable: true,
    configurable: true
  });

  global.$DefineOwnProperty("setInterval", {
    value: new NativeFunctionValue(realm, "global.setInterval", "", 2, (context, args) => {
      throw new Error("TODO: implement global.setInterval");
    }),
    writable: true,
    enumerable: true,
    configurable: true
  });
}
