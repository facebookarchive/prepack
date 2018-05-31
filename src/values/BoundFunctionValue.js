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
import { Value, FunctionValue, ObjectValue } from "./index.js";
import invariant from "../invariant.js";

/* Bound Function Exotic Objects */
export default class BoundFunctionValue extends FunctionValue {
  constructor(realm: Realm, intrinsicName?: string) {
    super(realm, intrinsicName);
  }

  $BoundTargetFunction: ObjectValue;
  $BoundThis: Value;
  $BoundArguments: Array<Value>;

  // Override.
  getName(): string {
    return "Bound";
  }

  hasDefaultLength(): boolean {
    let f = this.$BoundTargetFunction;
    if (!(f instanceof FunctionValue) || !f.hasDefaultLength()) return false;
    let fl = f.getLength();
    invariant(fl !== undefined);
    return this.getLength() === Math.max(fl - this.$BoundArguments.length, 0);
  }
}
