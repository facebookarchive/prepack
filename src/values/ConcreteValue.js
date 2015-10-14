/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { Realm } from "../realm.js";
import { EmptyValue, NumberValue, ObjectValue, UndefinedValue, Value } from "./index.js";
import invariant from "../invariant.js";

export default class ConcreteValue extends Value {
  constructor(realm: Realm, intrinsicName?: string) {
    invariant(realm, "realm required");
    super(realm, intrinsicName);
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

  mightBeUndefined(): boolean {
    return this instanceof UndefinedValue;
  }

  mightHaveBeenDeleted(): boolean {
    return false;
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

  throwIfNotConcreteObject(): ObjectValue {
    return this.throwIfNotObject();
  }

  throwIfNotObject(): ObjectValue {
    invariant(false, "expected this to be an object if concrete");
  }

}
