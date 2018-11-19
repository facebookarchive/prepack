/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import type { Realm } from "../realm.js";
import {
  EmptyValue,
  NullValue,
  NumberValue,
  ObjectValue,
  PrimitiveValue,
  StringValue,
  BooleanValue,
  SymbolValue,
  UndefinedValue,
  Value,
} from "./index.js";
import invariant from "../invariant.js";

export default class ConcreteValue extends Value {
  constructor(realm: Realm, intrinsicName?: string) {
    invariant(realm, "realm required");
    super(realm, intrinsicName);
  }

  isTemporal(): boolean {
    return false;
  }
  mightNotBeFalse(): boolean {
    return !this.mightBeFalse();
  }

  mightBeNull(): boolean {
    return this instanceof NullValue;
  }

  mightNotBeNull(): boolean {
    return !(this instanceof NullValue);
  }

  mightBeNumber(): boolean {
    return this instanceof NumberValue;
  }

  mightNotBeNumber(): boolean {
    return !(this instanceof NumberValue);
  }

  mightNotBeObject(): boolean {
    return !(this instanceof ObjectValue);
  }

  mightBeObject(): boolean {
    return this instanceof ObjectValue;
  }

  mightBeString(): boolean {
    return this instanceof StringValue;
  }

  mightNotBeString(): boolean {
    return !(this instanceof StringValue);
  }

  mightBeUndefined(): boolean {
    return this instanceof UndefinedValue;
  }

  mightNotBeUndefined(): boolean {
    return !(this instanceof UndefinedValue);
  }

  mightHaveBeenDeleted(): boolean {
    return this instanceof EmptyValue;
  }

  promoteEmptyToUndefined(): Value {
    if (this instanceof EmptyValue) return this.$Realm.intrinsics.undefined;
    return this;
  }

  throwIfNotConcrete(): ConcreteValue {
    return this;
  }

  throwIfNotConcreteNumber(): NumberValue {
    invariant(false, "expected this to be a number if concrete");
  }

  throwIfNotConcreteString(): StringValue {
    invariant(false, "expected this to be a string if concrete");
  }

  throwIfNotConcreteBoolean(): BooleanValue {
    invariant(false, "expected this to be a boolean if concrete");
  }

  throwIfNotConcreteSymbol(): SymbolValue {
    invariant(false, "expected this to be a symbol if concrete");
  }

  throwIfNotConcreteObject(): ObjectValue {
    return this.throwIfNotObject();
  }

  throwIfNotConcretePrimitive(): PrimitiveValue {
    invariant(false, "expected this to be a primitive value if concrete");
  }

  throwIfNotObject(): ObjectValue {
    invariant(false, "expected this to be an object if concrete");
  }
}
