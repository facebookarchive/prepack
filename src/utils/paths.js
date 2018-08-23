/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import { AbstractValue, ConcreteValue, NullValue, UndefinedValue, Value } from "../values/index.js";
import { InfeasiblePathError } from "../errors.js";
import type { Realm } from "../realm.js";
import invariant from "../invariant.js";

export class PathImplementation {
  implies(condition: Value): boolean {
    if (!condition.mightNotBeTrue()) return true; // any path implies true
    let path = condition.$Realm.pathConditions;
    for (let i = path.length - 1; i >= 0; i--) {
      let pathCondition = path[i];
      if (pathCondition.implies(condition)) return true;
    }
    return false;
  }

  impliesNot(condition: Value): boolean {
    if (!condition.mightNotBeFalse()) return true; // any path implies !false
    let path = condition.$Realm.pathConditions;
    for (let i = path.length - 1; i >= 0; i--) {
      let pathCondition = path[i];
      if (pathCondition.impliesNot(condition)) return true;
    }
    return false;
  }

  withCondition<T>(condition: Value, evaluate: () => T): T {
    let realm = condition.$Realm;
    if (!condition.mightNotBeFalse()) {
      if (realm.impliesCounterOverflowed) throw new InfeasiblePathError();
      invariant(false, "assuming that false equals true is asking for trouble");
    }
    let savedPath = realm.pathConditions;
    realm.pathConditions = [];
    try {
      pushPathCondition(condition);
      pushRefinedConditions(realm, savedPath);
      return evaluate();
    } catch (e) {
      if (e instanceof InfeasiblePathError) {
        // if condition is true, one of the saved path conditions must be false
        // since we have to assume that those conditions are true we now know that on this path, condition is false
        realm.pathConditions = savedPath;
        pushInversePathCondition(condition);
      }
      throw e;
    } finally {
      realm.pathConditions = savedPath;
    }
  }

  withInverseCondition<T>(condition: Value, evaluate: () => T): T {
    let realm = condition.$Realm;
    if (!condition.mightNotBeTrue()) {
      if (realm.impliesCounterOverflowed) throw new InfeasiblePathError();
      invariant(false, "assuming that false equals true is asking for trouble");
    }
    let savedPath = realm.pathConditions;
    realm.pathConditions = [];
    try {
      pushInversePathCondition(condition);
      pushRefinedConditions(realm, savedPath);
      return evaluate();
    } catch (e) {
      if (e instanceof InfeasiblePathError) {
        // if condition is false, one of the saved path conditions must be false
        // since we have to assume that those conditions are true we now know that on this path, condition is true
        realm.pathConditions = savedPath;
        pushPathCondition(condition);
      }
      throw e;
    } finally {
      realm.pathConditions = savedPath;
    }
  }

  pushAndRefine(condition: Value): void {
    let realm = condition.$Realm;
    let savedPath = realm.pathConditions;
    realm.pathConditions = [];

    pushPathCondition(condition);
    pushRefinedConditions(realm, savedPath);
  }

  pushInverseAndRefine(condition: Value): void {
    let realm = condition.$Realm;
    let savedPath = realm.pathConditions;
    realm.pathConditions = [];

    pushInversePathCondition(condition);
    pushRefinedConditions(realm, savedPath);
  }
}

// A path condition is an abstract value that must be true in this particular code path, so we want to assume as much
function pushPathCondition(condition: Value): void {
  let realm = condition.$Realm;
  if (!condition.mightNotBeFalse()) {
    if (realm.impliesCounterOverflowed) throw new InfeasiblePathError();
    invariant(false, "assuming that false equals true is asking for trouble");
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
  } else if (condition.kind === "===") {
    let [left, right] = condition.args;
    if (right instanceof AbstractValue && right.kind === "conditional") [left, right] === [right, left];
    if (left instanceof AbstractValue && left.kind === "conditional") {
      let [cond, x, y] = left.args;
      if (right instanceof ConcreteValue && x instanceof ConcreteValue && y instanceof ConcreteValue) {
        if (right.equals(x) && !right.equals(y)) {
          pushPathCondition(cond);
        } else if (!right.equals(x) && right.equals(y)) {
          pushInversePathCondition(cond);
        }
      }
    }
    realm.pathConditions.push(condition);
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

// An inverse path condition is an abstract value that must be false in this particular code path, so we want to assume as much
function pushInversePathCondition(condition: Value): void {
  let realm = condition.$Realm;
  if (!condition.mightNotBeTrue()) {
    if (realm.impliesCounterOverflowed) throw new InfeasiblePathError();
    invariant(false, "assuming that false equals true is asking for trouble");
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
        if (op === "!==") pushPathCondition(left);
        else pushInversePathCondition(left);
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

function pushRefinedConditions(realm: Realm, unrefinedConditions: Array<AbstractValue>): void {
  let refinedConditions = unrefinedConditions.map(c => realm.simplifyAndRefineAbstractCondition(c));
  if (refinedConditions.some(c => !c.mightNotBeFalse())) throw new InfeasiblePathError();
  let pc = realm.pathConditions;
  realm.pathConditions = [];
  for (let c of refinedConditions) pushPathCondition(c);
  for (let c of pc) realm.pathConditions.push(c);
}
