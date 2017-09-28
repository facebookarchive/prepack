/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { PrimitiveValue, Value } from "./index.js";
import type { Realm } from "../realm.js";

export default class SymbolValue extends PrimitiveValue {
  constructor(realm: Realm, desc: void | Value, intrinsicName?: string) {
    super(realm, intrinsicName);
    this.$Description = desc;
  }

  $Description: void | Value;

  hashValue: void | number;

  equals(x: Value): boolean {
    return x instanceof SymbolValue && this.hashValue === x.hashValue && this.$Description === x.$Description;
  }

  getHash(): number {
    if (!this.hashValue) {
      this.hashValue = this.$Description ? this.$Description.getHash() : ++this.$Realm.symbolCount;
    }
    return this.hashValue;
  }

  mightBeFalse(): boolean {
    return false;
  }

  throwIfNotConcreteSymbol(): SymbolValue {
    return this;
  }

  _serialize(): Symbol {
    return Symbol(this.$Description);
  }
}
