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

export class NumberValue extends PrimitiveValue {
  constructor(realm: Realm, value: number, intrinsicName?: string) {
    super(realm, intrinsicName);

    this.value = value;
  }

  value: number;

  equals(x: Value): boolean {
    return x instanceof NumberValue && Object.is(this.value, x.value);
  }

  getHash(): number {
    let num = Math.abs(this.value);
    if (num < 100) num *= 10000000;
    return num | 0; // make a 32-bit integer out of this and get rid of NaN
  }

  mightBeFalse(): boolean {
    return this.value === 0 || isNaN(this.value);
  }

  throwIfNotConcreteNumber(): NumberValue {
    return this;
  }

  _serialize(): number {
    return this.value;
  }

  toDisplayString(): string {
    return this.value.toString();
  }
}

export class IntegralValue extends NumberValue {
  constructor(realm: Realm, value: number, intrinsicName?: string) {
    super(realm, value, intrinsicName);
  }

  static createFromNumberValue(realm: Realm, value: number, intrinsicName?: string): IntegralValue | NumberValue {
    return Number.isInteger(value)
      ? new IntegralValue(realm, value, intrinsicName)
      : new NumberValue(realm, value, intrinsicName);
  }
}
