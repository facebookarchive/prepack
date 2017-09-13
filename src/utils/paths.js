/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { AbstractValue, ConcreteValue, Value } from "../values/index.js";
import invariant from "../invariant.js";
import simplifyAbstractValue from "../utils/simplifier.js";

export function withPathCondition<T>(condition: AbstractValue, evaluate: () => T): T {
  let realm = condition.$Realm;
  let savedPath = realm.pathConditions;
  realm.pathConditions = [];
  try {
    pushPathCondition(condition);
    pushRefinedConditions(savedPath);
    return evaluate();
  } finally {
    realm.pathConditions = savedPath;
  }
}

export function withInversePathCondition<T>(condition: AbstractValue, evaluate: () => T): T {
  let realm = condition.$Realm;
  let savedPath = realm.pathConditions;
  realm.pathConditions = [];
  try {
    pushInversePathCondition(condition);
    pushRefinedConditions(savedPath);
    return evaluate();
  } finally {
    realm.pathConditions = savedPath;
  }
}

// A path condition is an abstract value that is known to be true in a particular code path
function pushPathCondition(condition: Value) {
  invariant(condition.mightNotBeFalse()); // it is mistake to assert that false is true
  if (condition instanceof ConcreteValue) return;
  if (!condition.mightNotBeTrue()) return;
  invariant(condition instanceof AbstractValue);
  let realm = condition.$Realm;
  if (condition.kind === "&&") {
    let left = condition.args[0];
    let right = condition.args[1];
    invariant(left instanceof AbstractValue); // it is a mistake to create an abstract value when concrete value will do
    pushPathCondition(left);
    pushPathCondition(right);
  } else {
    realm.pathConditions.push(condition);
  }
}

// An inverse path condition is an abstract value that is known to be false in a particular code path
function pushInversePathCondition(condition: Value) {
  invariant(condition.mightNotBeTrue()); // it is mistake to assert that true is false
  if (condition instanceof ConcreteValue) return;
  invariant(condition instanceof AbstractValue);
  if (condition.kind === "||") {
    let left = condition.args[0];
    let right = condition.args[1];
    invariant(left instanceof AbstractValue); // it is a mistake to create an abstract value when concrete value will do
    pushInversePathCondition(left);
    pushInversePathCondition(right);
  } else {
    let realm = condition.$Realm;
    let inverseCondition = AbstractValue.createFromUnaryOp(realm, "!", condition);
    pushPathCondition(inverseCondition);
    let simplifiedInverseCondition = simplifyAbstractValue(realm, inverseCondition);
    if (simplifiedInverseCondition !== inverseCondition) pushPathCondition(simplifiedInverseCondition);
  }
}

function pushRefinedConditions(unrefinedConditions: Array<AbstractValue>) {
  for (let unrefinedCond of unrefinedConditions) {
    pushPathCondition(unrefinedCond.refineWithPathCondition());
  }
}
