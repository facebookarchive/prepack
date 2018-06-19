/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { AbstractObjectValue, AbstractValue, ConcreteValue, ObjectValue } from "../values/index.js";
import { type VisitEntryCallbacks } from "./generator.js";

export function objectAssignTemporalPurityCheck(
  callbacks: VisitEntryCallbacks,
  declared: void | Value,
  args: Array<Value>
): boolean {
  let [, to, ...sources] = args;
  // First we check that all the "source" values are simple.
  // If they are simple, that means they don't have getters on them
  // that might possibly throw at runtime.
  // If they are, then we can proceed to checking the "to" value
  for (let source of sources) {
    if ((source instanceof AbstractObjectValue || source instanceof ObjectValue) && !source.isSimpleObject()) {
      return false;
    }
  }
  // If the "to" value in the temporal Object.assign call is
  // not used as reference and it is conrete/abstract, we can safely
  // remove the Object.assign temporal altogether
  if (to instanceof ConcreteValue || to instanceof AbstractValue) {
    return callbacks.canSkip(to);
  }
  return false;
}
