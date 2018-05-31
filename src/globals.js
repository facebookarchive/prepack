/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import type { Realm } from "./realm.js";
import initializePrepackGlobals from "./intrinsics/prepack/global.js";
import initializeDOMGlobals from "./intrinsics/dom/global.js";
import initializeReactNativeGlobals from "./intrinsics/react-native/global.js";
import initializeReactMocks from "./intrinsics/fb-www/global.js";

export default function(realm: Realm): Realm {
  initializePrepackGlobals(realm);
  if (realm.isCompatibleWith("browser")) {
    initializeDOMGlobals(realm);
  }
  if (realm.isCompatibleWith("fb-www") || realm.isCompatibleWith("node-react")) {
    initializeDOMGlobals(realm);
    initializeReactMocks(realm);
  }
  if (realm.isCompatibleWith(realm.MOBILE_JSC_VERSION) || realm.isCompatibleWith("mobile")) {
    initializeReactNativeGlobals(realm);
  }
  return realm;
}
