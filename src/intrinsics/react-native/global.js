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

import initializeConsole from "../common/console.js";
import { PropertyDescriptor } from "../../descriptors.js";

export default function(realm: Realm): void {
  let global = realm.$GlobalObject;

  if (!realm.isCompatibleWith(realm.MOBILE_JSC_VERSION) && !realm.isCompatibleWith("mobile"))
    global.$DefineOwnProperty(
      "console",
      new PropertyDescriptor({
        value: initializeConsole(realm),
        writable: true,
        enumerable: false,
        configurable: true,
      })
    );

  let names = [
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
    "Promise",
    "WeakSet",
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
    "XMLHttpRequest",
  ];

  if (realm.isCompatibleWith(realm.MOBILE_JSC_VERSION)) names.push("Symbol");

  for (let name of names) {
    global.$DefineOwnProperty(
      name,
      new PropertyDescriptor({
        value: realm.intrinsics.undefined,
        writable: true,
        enumerable: false,
        configurable: true,
      })
    );
  }
}
