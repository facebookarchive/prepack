/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import { PrimitiveValue, Value } from "./index.js";
import type { Realm } from "../realm.js";

export default class BooleanValue extends PrimitiveValue {
  constructor(realm: Realm, value: boolean, intrinsicName?: string) {
    super(realm, intrinsicName);
    this.value = value;

    if (value && realm.intrinsics.true) return realm.intrinsics.true;
    if (!value && realm.intrinsics.false) return realm.intrinsics.false;
  }

  value: boolean;

  equals(x: Value): boolean {
    return x instanceof BooleanValue && this.value === x.value;
  }

  getHash(): number {
    return this.value ? 12484058682847432 : 3777063795205331;
  }

  mightBeFalse(): boolean {
    return !this.value;
  }

  throwIfNotConcreteBoolean(): BooleanValue {
    return this;
  }

  _serialize(): boolean {
    return this.value;
  }

  toDisplayString(): string {
    return this.value.toString();
  }
}
