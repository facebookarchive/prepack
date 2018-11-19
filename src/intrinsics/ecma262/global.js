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
import invariant from "../../invariant.js";
import { PropertyDescriptor } from "../../descriptors.js";

export default function(realm: Realm): void {
  let global = realm.$GlobalObject;

  global.$DefineOwnProperty(
    "global",
    new PropertyDescriptor({
      value: global,
      writable: true,
      enumerable: false,
      configurable: true,
    })
  );

  for (let name of ["undefined", "NaN", "Infinity"]) {
    global.$DefineOwnProperty(
      name,
      new PropertyDescriptor({
        value: realm.intrinsics[name],
        writable: false,
        enumerable: false,
        configurable: false,
      })
    );
  }
  let typeNames = [
    "String",
    "Object",
    "Function",
    "Array",
    "Number",
    "RegExp",
    "Date",
    "Math",
    "Error",
    "Function",
    "TypeError",
    "RangeError",
    "ReferenceError",
    "SyntaxError",
    "URIError",
    "EvalError",
    "Boolean",
    "DataView",
    "Float32Array",
    "Float64Array",
    "Int8Array",
    "Int16Array",
    "Int32Array",
    "Map",
    "Set",
    "WeakMap",
    "Uint8Array",
    "Uint8ClampedArray",
    "Uint16Array",
    "Uint32Array",
    "ArrayBuffer",
    "JSON",
  ];
  if (!realm.isCompatibleWith(realm.MOBILE_JSC_VERSION) && !realm.isCompatibleWith("mobile"))
    typeNames = typeNames.concat("Symbol", "Promise", "WeakSet", "Proxy", "Reflect");
  for (let name of typeNames) {
    // need to check if the property exists (it may not due to --compatibility)
    if (realm.intrinsics[name]) {
      global.$DefineOwnProperty(
        name,
        new PropertyDescriptor({
          value: realm.intrinsics[name],
          writable: true,
          enumerable: false,
          configurable: true,
        })
      );
    } else {
      invariant(
        name === "Symbol" || name === "Promise" || name === "WeakSet" || name === "Proxy" || name === "Reflect"
      );
      invariant(realm.isCompatibleWith(realm.MOBILE_JSC_VERSION) || realm.isCompatibleWith("mobile"));
    }
  }
  for (let name of [
    "parseFloat",
    "parseInt",
    "console",
    "isNaN",
    "eval",
    "isFinite",
    "encodeURI",
    "decodeURI",
    "encodeURIComponent",
    "decodeURIComponent",
  ]) {
    global.$DefineOwnProperty(
      name,
      new PropertyDescriptor({
        value: realm.intrinsics[name],
        writable: true,
        enumerable: false,
        configurable: true,
      })
    );
  }
}
