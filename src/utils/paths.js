/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import { InfeasiblePathError } from "../errors.js";
import invariant from "../invariant.js";
import { Realm } from "../realm.js";
import { PathConditions } from "../types.js";
import { AbstractValue, ConcreteValue, NullValue, UndefinedValue, Value } from "../values/index.js";

export class PathConditionsImplementation extends PathConditions {
  constructor(baseConditions?: void | PathConditions) {
    super();
    this._assumedConditions = new Set();
    invariant(baseConditions === undefined || baseConditions instanceof PathConditionsImplementation);
    this._baseConditions = baseConditions;
  }

  _assumedConditions: Set<AbstractValue>;
  _baseConditions: void | PathConditionsImplementation;
  _impliedConditions: void | Set<AbstractValue>;
  _impliedNegatives: void | Set<AbstractValue>;
  _failedImplications: void | Set<AbstractValue>;
  _failedNegativeImplications: void | Set<AbstractValue>;

  add(c: AbstractValue): void {
    this._assumedConditions.add(c);
  }

  implies(e: AbstractValue): boolean {
    if (this._assumedConditions.has(e)) return true;
    if (this._impliedConditions !== undefined && this._impliedConditions.has(e)) return true;
    if (this._impliedNegatives !== undefined && this._impliedNegatives.has(e)) return false;
    if (this._failedImplications !== undefined && this._failedImplications.has(e)) return false;
    if (this._baseConditions !== undefined && this._baseConditions.implies(e)) return true;
    for (let assumedCondition of this._assumedConditions) {
      if (assumedCondition.implies(e)) {
        if (this._impliedConditions === undefined) this._impliedConditions = new Set();
        this._impliedConditions.add(e);
        return true;
      }
    }
    if (this._failedImplications === undefined) this._failedImplications = new Set();
    this._failedImplications.add(e);
    return false;
  }

  impliesNot(e: AbstractValue): boolean {
    if (this._assumedConditions.has(e)) return false;
    if (this._impliedConditions !== undefined && this._impliedConditions.has(e)) return false;
    if (this._impliedNegatives !== undefined && this._impliedNegatives.has(e)) return true;
    if (this._failedNegativeImplications !== undefined && this._failedNegativeImplications.has(e)) return false;
    if (this._baseConditions !== undefined && this._baseConditions.impliesNot(e)) return true;
    for (let assumedCondition of this._assumedConditions) {
      invariant(assumedCondition !== undefined);
      if (assumedCondition.impliesNot(e)) {
        if (this._impliedNegatives === undefined) this._impliedNegatives = new Set();
        this._impliedNegatives.add(e);
        return true;
      }
    }
    if (this._failedNegativeImplications === undefined) this._failedNegativeImplications = new Set();
    this._failedNegativeImplications.add(e);
    return false;
  }

  isEmpty(): boolean {
    return this._assumedConditions.size === 0;
  }

  getLength(): number {
    return this._assumedConditions.size;
  }

  getAssumedConditions(): Set<AbstractValue> {
    return this._assumedConditions;
  }

  refineBaseConditons(realm: Realm): void {
    if (realm.abstractValueImpliesMax > 0) return;
    let refine = (condition: AbstractValue) => {
      let refinedCondition = realm.simplifyAndRefineAbstractCondition(condition);
      if (refinedCondition !== condition) {
        if (!refinedCondition.mightNotBeFalse()) throw new InfeasiblePathError();
        if (refinedCondition instanceof AbstractValue) {
          this.add(refinedCondition);
          // These might have different answers now that we've add another path condition
          this._failedImplications = undefined;
          this._failedNegativeImplications = undefined;
        }
      }
    };
    if (this._baseConditions !== undefined) {
      let savedBaseConditions = this._baseConditions;
      try {
        this._baseConditions = undefined;
        for (let assumedCondition of savedBaseConditions._assumedConditions) {
          if (assumedCondition.kind === "||") {
            refine(assumedCondition);
          }
        }
      } finally {
        this._baseConditions = savedBaseConditions;
      }
      savedBaseConditions.refineBaseConditons(realm);
    }
  }

  clone(): PathConditionsImplementation {
    let newPathCondition = new PathConditionsImplementation();
    let addAssumedConditionsRecursively = (pathCondition: PathConditionsImplementation) => {
      pathCondition._assumedConditions.forEach(condition => newPathCondition._assumedConditions.add(condition));
      if (pathCondition._baseConditions) addAssumedConditionsRecursively(pathCondition._baseConditions);
    };
    addAssumedConditionsRecursively(this);
    return newPathCondition;
  }
}

export class PathImplementation {
  implies(condition: Value): boolean {
    if (!condition.mightNotBeTrue()) return true; // any path implies true
    if (!condition.mightNotBeFalse()) return false; // no path condition is false
    invariant(condition instanceof AbstractValue);
    return condition.$Realm.pathConditions.implies(condition);
  }

  impliesNot(condition: Value): boolean {
    if (!condition.mightNotBeFalse()) return true; // any path implies !false
    if (!condition.mightNotBeTrue()) return false; // no path condition is false, so none can imply !true
    invariant(condition instanceof AbstractValue);
    return condition.$Realm.pathConditions.impliesNot(condition);
  }

  withCondition<T>(condition: Value, evaluate: () => T): T {
    let realm = condition.$Realm;
    if (!condition.mightNotBeFalse()) {
      if (realm.impliesCounterOverflowed) throw new InfeasiblePathError();
      invariant(false, "assuming that false equals true is asking for trouble");
    }
    let savedPath = realm.pathConditions;
    realm.pathConditions = new PathConditionsImplementation(savedPath);
    try {
      pushPathCondition(condition);
      realm.pathConditions.refineBaseConditons(realm);
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
    realm.pathConditions = new PathConditionsImplementation(savedPath);
    try {
      pushInversePathCondition(condition);
      realm.pathConditions.refineBaseConditons(realm);
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
    realm.pathConditions = new PathConditionsImplementation(savedPath);

    pushPathCondition(condition);
    realm.pathConditions.refineBaseConditons(realm);
  }

  pushInverseAndRefine(condition: Value): void {
    let realm = condition.$Realm;
    let savedPath = realm.pathConditions;
    realm.pathConditions = new PathConditionsImplementation(savedPath);

    pushInversePathCondition(condition);
    realm.pathConditions.refineBaseConditons(realm);
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
    realm.pathConditions.add(condition);
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
    realm.pathConditions.add(condition);
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
    if (right instanceof AbstractValue) right = realm.simplifyAndRefineAbstractCondition(right);
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
    let inverseCondition = AbstractValue.createFromUnaryOp(realm, "!", condition, false, undefined, true, true);
    pushPathCondition(inverseCondition);
    if (inverseCondition instanceof AbstractValue) {
      let simplifiedInverseCondition = realm.simplifyAndRefineAbstractCondition(inverseCondition);
      if (!simplifiedInverseCondition.equals(inverseCondition)) pushPathCondition(simplifiedInverseCondition);
    }
  }
}
