/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { ObjectValue } from "../values/index.js";
import type { Realm } from "../realm.js";

import invariant from "../invariant.js";
import { IsArray, IsArrayIndex } from "../methods/index.js";

/**
 * Get index property list length by searching array properties list for the max index key value plus 1.
 */
export function getSuggestedArrayLiteralLength(realm: Realm, val: ObjectValue): number {
  invariant(IsArray(realm, val));

  let length = 0;
  for (const key of val.properties.keys()) {
    if (IsArrayIndex(realm, key) && Number(key) >= length) {
      length = Number(key) + 1;
    }
  }
  return length;
}
