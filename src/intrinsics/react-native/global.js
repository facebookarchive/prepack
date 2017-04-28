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

import initializeConsole from "../common/console.js";

export default function (realm: Realm): void {
  let global = realm.$GlobalObject;

  global.$DefineOwnProperty("console", {
    value: initializeConsole(realm),
    writable: true,
    enumerable: false,
    configurable: true
  });

  for (let name of [
    // TODO: I'm not sure if these three document, setTimeout and setInterval
    // should be here.
    "document",
    "setTimeout",
    "setInterval",

    "window",
    "process",
    "setImmediate",
    "clearTimeout",
    "clearInterval",
    "clearImmediate",
    "alert",
    "navigator",
    "module",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "requestIdleCallback",
    "cancelIdleCallback",
    "Symbol",
    "Promise",
    "WeakSet",
    "WeakMap",
    "Proxy",
    "WebSocket",
    "Request",
    "Response",
    "Headers",
    "FormData",
    "Worker",
    "Node",
    "Blob",
    "URLSearchParams",
    "FileReader",
    "XMLHttpRequest"
  ]) {
    global.$DefineOwnProperty(name, {
      value: realm.intrinsics.undefined,
      writable: true,
      enumerable: false,
      configurable: true
    });
  }
}
