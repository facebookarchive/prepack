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
import type { ObjectValue } from "../../values/index.js";
import { build } from "./TypedArrayPrototype.js";

export default function(realm: Realm, obj: ObjectValue): void {
  build(realm, obj, "Uint16");
}
