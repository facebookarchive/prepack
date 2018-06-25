/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import { Realm } from "../realm.js";
import { ReturnCompletion } from "../completions.js";
import { AbstractObjectValue, AbstractValue, ConcreteValue, Value } from "../values/index.js";
import invariant from "../invariant.js";

function findAbstractComplexity(val: Value): number {
  if (val instanceof ConcreteValue) {
    return 0;
  }
  let abstractComplexity = 0;

  if (val instanceof AbstractValue && val.kind === "conditional") {
    abstractComplexity += findAbstractComplexity(val.args[1]);
    abstractComplexity += findAbstractComplexity(val.args[2]);
  } else if (val instanceof AbstractValue && (val.kind === "||" || val.kind === "&&")) {
    abstractComplexity += findAbstractComplexity(val.args[0]);
    abstractComplexity += findAbstractComplexity(val.args[1]);
  } else if (val instanceof AbstractObjectValue && !val.values.isTop()) {
    abstractComplexity += 5;
  } else {
    abstractComplexity += 5;
  }
  return abstractComplexity;
}

export function shouldEffectsFromFunctionCallBeInlined(realm: Realm, effects: Effects): boolean {
  let { result, generator } = effects;

  invariant(result instanceof ReturnCompletion);
  // If we create 3 lines or less, inline the function regardless
  if (generator._entries.length < 4) {
    return true;
  }
  // Otherwise, we try to find how complex the abstract value returned is.
  // The more complex, the more likely we shouldn't inline the value
  if (result.value instanceof AbstractValue) {
    return findAbstractComplexity(result.value) < 5;
  }
  return true;
}
