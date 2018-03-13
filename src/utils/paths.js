/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { AbstractValue, ConcreteValue, NullValue, UndefinedValue, Value } from "../values/index.js";
import { CompilerDiagnostic, FatalError } from "../errors.js";
import invariant from "../invariant.js";

export class PathImplementation {
  implies(condition: AbstractValue): boolean {
    if (!condition.mightNotBeTrue()) return true; // any path implies true
    let path = condition.$Realm.pathConditions;
    for (let i = path.length - 1; i >= 0; i--) {
      let pathCondition = path[i];
      if (pathCondition.implies(condition)) return true;
    }
    return false;
  }

  impliesNot(condition: AbstractValue): boolean {
    if (!condition.mightNotBeFalse()) return true; // any path implies !false
    let path = condition.$Realm.pathConditions;
    for (let i = path.length - 1; i >= 0; i--) {
      let pathCondition = path[i];
      if (pathCondition.impliesNot(condition)) return true;
    }
    return false;
  }

  withCondition<T>(condition: AbstractValue, evaluate: () => T): T {
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

  withInverseCondition<T>(condition: AbstractValue, evaluate: () => T): T {
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

  pushAndRefine(condition: AbstractValue) {
    let realm = condition.$Realm;
    let savedPath = realm.pathConditions;
    realm.pathConditions = [];

    pushPathCondition(condition);
    pushRefinedConditions(savedPath);
  }

  pushInverseAndRefine(condition: AbstractValue) {
    let realm = condition.$Realm;
    let savedPath = realm.pathConditions;
    realm.pathConditions = [];

    pushInversePathCondition(condition);
    pushRefinedConditions(savedPath);
  }
}

// A path condition is an abstract value that is known to be true in a particular code path
function pushPathCondition(condition: Value) {
  let realm = condition.$Realm;
  if (!condition.mightNotBeFalse()) {
    let error = new CompilerDiagnostic(
      `cannot push false on path condition`,
      realm.currentLocation,
      "PP0029",
      "RecoverableError"
    );
    realm.handleError(error);
    throw new FatalError();
  }
  if (condition instanceof ConcreteValue) return;
  if (!condition.mightNotBeTrue()) return;
  invariant(condition instanceof AbstractValue);
  if (condition.kind === "&&") {
    let left = condition.args[0];
    let right = condition.args[1];
    invariant(left instanceof AbstractValue); // it is a mistake to create an abstract value when concrete value will do
    pushPathCondition(left);
    pushPathCondition(right);
  } else {
    if (condition.kind === "!=" || condition.kind === "==") {
      let left = condition.args[0];
      let right = condition.args[1];
      if (left instanceof ConcreteValue && right instanceof AbstractValue) [left, right] = [right, left];
      if (left instanceof AbstractValue && (right instanceof UndefinedValue || right instanceof NullValue)) {
        let op = condition.kind === "!=" ? "!==" : "===";
        if (op === "!==") pushPathCondition(left);
        else pushInversePathCondition(left);
        let leftNeNull = AbstractValue.createFromBinaryOp(realm, op, left, realm.intrinsics.null);
        if (leftNeNull.mightNotBeFalse()) pushPathCondition(leftNeNull);
        let leftNeUndefined = AbstractValue.createFromBinaryOp(realm, op, left, realm.intrinsics.undefined);
        if (leftNeUndefined.mightNotBeFalse()) pushPathCondition(leftNeUndefined);
        return;
      }
    }
    realm.pathConditions.push(condition);
  }
}

// An inverse path condition is an abstract value that is known to be false in a particular code path
function pushInversePathCondition(condition: Value) {
  let realm = condition.$Realm;
  if (!condition.mightNotBeTrue()) {
    let error = new CompilerDiagnostic(
      `cannot push true on inverse path condition`,
      realm.currentLocation,
      "PP0029",
      "RecoverableError"
    );
    realm.handleError(error);
    throw new FatalError();
  }
  if (condition instanceof ConcreteValue) return;
  invariant(condition instanceof AbstractValue);
  if (condition.kind === "||") {
    let left = condition.args[0];
    let right = condition.args[1];
    invariant(left instanceof AbstractValue); // it is a mistake to create an abstract value when concrete value will do
    pushInversePathCondition(left);
    if (right.mightNotBeTrue()) pushInversePathCondition(right);
  } else {
    if (condition.kind === "!=" || condition.kind === "==") {
      let left = condition.args[0];
      let right = condition.args[1];
      if (left instanceof ConcreteValue && right instanceof AbstractValue) [left, right] = [right, left];
      if (left instanceof AbstractValue && (right instanceof UndefinedValue || right instanceof NullValue)) {
        let op = condition.kind === "!=" ? "===" : "!==";
        if (op === "!==") pushInversePathCondition(left);
        else pushPathCondition(left);
        let leftEqNull = AbstractValue.createFromBinaryOp(realm, op, left, realm.intrinsics.null);
        if (leftEqNull.mightNotBeFalse()) pushPathCondition(leftEqNull);
        let leftEqUndefined = AbstractValue.createFromBinaryOp(realm, op, left, realm.intrinsics.undefined);
        if (leftEqUndefined.mightNotBeFalse()) pushPathCondition(leftEqUndefined);
        return;
      }
    }
    let inverseCondition = AbstractValue.createFromUnaryOp(realm, "!", condition);
    pushPathCondition(inverseCondition);
    if (inverseCondition instanceof AbstractValue) {
      let simplifiedInverseCondition = realm.simplifyAndRefineAbstractCondition(inverseCondition);
      if (!simplifiedInverseCondition.equals(inverseCondition)) pushPathCondition(simplifiedInverseCondition);
    }
  }
}

function pushRefinedConditions(unrefinedConditions: Array<AbstractValue>) {
  for (let unrefinedCond of unrefinedConditions) {
    pushPathCondition(unrefinedCond.$Realm.simplifyAndRefineAbstractCondition(unrefinedCond));
  }
}
