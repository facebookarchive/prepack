/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { PrimitiveValue } from "./index.js";
import type { Realm } from "../realm.js";

export default class BooleanValue extends PrimitiveValue {
  constructor(realm: Realm, value: boolean, intrinsicName?: string) {
    super(realm, intrinsicName);
    this.value = value;

    if (value && realm.intrinsics.true) return realm.intrinsics.true;
    if (!value && realm.intrinsics.false) return realm.intrinsics.false;
  }

  value: boolean;

  _serialize(): boolean {
    return this.value;
  }
}
