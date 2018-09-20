/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import { hashString } from "../methods/index.js";
import { PrimitiveValue, Value } from "./index.js";
import type { Realm } from "../realm.js";

export default class StringValue extends PrimitiveValue {
  constructor(realm: Realm, value: string, intrinsicName?: string) {
    super(realm, intrinsicName);
    this.value = value;
  }

  value: string;

  equals(x: Value): boolean {
    return x instanceof StringValue && this.value === x.value;
  }

  getHash(): number {
    return hashString(this.value);
  }

  mightBeFalse(): boolean {
    return this.value.length === 0;
  }

  throwIfNotConcreteString(): StringValue {
    return this;
  }

  _serialize(): string {
    return this.value;
  }

  toDisplayString(): string {
    return JSON.stringify(this.value);
  }
}
