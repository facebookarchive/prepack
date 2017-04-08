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

export default class NumberValue extends PrimitiveValue {
  constructor(realm: Realm, value: number, intrinsicName?: string) {
    super(realm, intrinsicName);

    this.value = value;
  }

  value: number;

  throwIfNotConcreteNumber(): NumberValue {
    return this;
  }

  _serialize(): number {
    return this.value;
  }
}
