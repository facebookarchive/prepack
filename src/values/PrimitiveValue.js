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
import { ConcreteValue } from "./index.js";
import invariant from "../invariant.js";

export default class PrimitiveValue extends ConcreteValue {
  constructor(realm: Realm, intrinsicName?: string) {
    invariant(realm, "realm required");
    super(realm, intrinsicName);
  }

  throwIfNotConcretePrimitive(): PrimitiveValue {
    return this;
  }

  toDisplayString(): string {
    invariant(false, "abstract method; please override");
  }
}
