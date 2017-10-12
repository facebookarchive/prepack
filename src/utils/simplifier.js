/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { BabelNodeSourceLocation } from "babel-types";
import { FatalError } from "../errors.js";
import { ValuesDomain } from "../domains/index.js";
import invariant from "../invariant.js";
import { ToBoolean } from "../methods/index.js";
import { Realm } from "../realm.js";
import { AbstractObjectValue, AbstractValue, BooleanValue, ConcreteValue, Value } from "../values/index.js";

export default function simplifyAbstractValue(realm: Realm, value: AbstractValue): Value {
  let savedHandler = realm.errorHandler;
  let savedIsReadOnly = realm.isReadOnly;
  realm.isReadOnly = true;
  try {
    realm.errorHandler = () => {
      throw new FatalError();
    };
    return simplify(realm, value);
  } catch (e) {
    return value;
  } finally {
    realm.errorHandler = savedHandler;
    realm.isReadOnly = savedIsReadOnly;
  }
}

function pathImplies(condition: AbstractValue): boolean {
  let path = condition.$Realm.pathConditions;
  for (let i = path.length - 1; i >= 0; i--) {
    let pathCondition = path[i];
    if (pathCondition.implies(condition)) return true;
  }
  return false;
}

function simplify(realm, value: Value): Value {
  if (value instanceof ConcreteValue) return value;
  invariant(value instanceof AbstractValue);
  let op = value.kind;
  switch (op) {
    case "!":
      return negate(realm, value.args[0], value.expressionLocation);
    case "||":
    case "&&": {
      let x = simplify(realm, value.args[0]);
      let y = simplify(realm, value.args[1]);
      if (x instanceof AbstractValue && x.equals(y)) return x;
      // todo: remove this check when there is an alternative way to indicate that an intrinsic object is nullable
      if (!(x instanceof AbstractObjectValue && x.isIntrinsic())) {
        // true && y <=> y
        // true || y <=> true
        if (!x.mightNotBeTrue()) return op === "&&" ? y : x;
        // (x == false) && y <=> x
        // false || y <=> y
        if (!x.mightNotBeFalse()) return op === "||" ? y : x;
      }
      if (x.getType() === BooleanValue && y.getType() === BooleanValue) {
        // (x: boolean) && true <=> x
        // x || true <=> true
        if (!y.mightNotBeTrue()) return op === "&&" ? x : realm.intrinsics.true;
        // (x: boolean) && false <=> false
        // (x: boolean) || false <=> x
        if (!y.mightNotBeFalse()) return op === "||" ? x : realm.intrinsics.false;
      }
      return AbstractValue.createFromLogicalOp(realm, (value.kind: any), x, y, value.expressionLocation);
    }
    case "==":
    case "!=":
    case "===":
    case "!==":
      return simplifyEquality(realm, value);
    case "conditional": {
      let c = simplify(realm, value.args[0]);
      let x = simplify(realm, value.args[1]);
      let y = simplify(realm, value.args[2]);
      if (!c.mightNotBeTrue()) return x;
      if (!c.mightNotBeFalse()) return y;
      invariant(c instanceof AbstractValue);
      if (pathImplies(c)) return x;
      let notc = AbstractValue.createFromUnaryOp(realm, "!", c);
      if (pathImplies(notc)) return y;
      if (pathImplies(AbstractValue.createFromBinaryOp(realm, "===", value, x))) return x;
      if (pathImplies(AbstractValue.createFromBinaryOp(realm, "!==", value, x))) return y;
      if (pathImplies(AbstractValue.createFromBinaryOp(realm, "!==", value, y))) return x;
      if (pathImplies(AbstractValue.createFromBinaryOp(realm, "===", value, y))) return y;
      return AbstractValue.createFromConditionalOp(realm, c, x, y, value.expressionLocation);
    }
    default:
      return value;
  }
}

function simplifyEquality(realm: Realm, equality: AbstractValue): Value {
  let loc = equality.expressionLocation;
  let op = equality.kind;
  let [x, y] = equality.args;
  if (x instanceof ConcreteValue) [x, y] = [y, x];
  if (x instanceof AbstractValue && x.kind === "conditional" && (!y.mightNotBeUndefined() || !y.mightNotBeNull())) {
    // try to simplify "(cond ? xx : xy) op undefined/null" to just "cond" or "!cond"
    let [cond, xx, xy] = x.args;
    invariant(cond instanceof AbstractValue); // otherwise the the conditional should not have been created
    if (op === "===" || op === "!==") {
      // if xx === undefined && xy !== undefined then cond <=> x === undefined
      if (!y.mightNotBeUndefined() && !xx.mightNotBeUndefined() && !xy.mightBeUndefined())
        return op === "===" ? makeBoolean(realm, cond, loc) : negate(realm, cond, loc);
      // if xx !== undefined && xy === undefined then !cond <=> x === undefined
      if (!y.mightNotBeUndefined() && !xx.mightBeUndefined() && !xy.mightNotBeUndefined())
        return op === "===" ? negate(realm, cond, loc) : makeBoolean(realm, cond, loc);
      // if xx === null && xy !== null then cond <=> x === null
      if (!y.mightNotBeNull() && !xx.mightNotBeNull() && !xy.mightBeNull())
        return op === "===" ? makeBoolean(realm, cond, loc) : negate(realm, cond, loc);
      // if xx !== null && xy === null then !cond <=> x === null
      if (!y.mightNotBeNull() && !xx.mightBeNull() && !xy.mightNotBeNull())
        return op === "===" ? negate(realm, cond, loc) : makeBoolean(realm, cond, loc);
    } else {
      invariant(op === "==" || op === "!=");
      // if xx cannot be undefined/null and xy is undefined/null then !cond <=> x == undefined/null
      if (!xx.mightBeUndefined() && !xx.mightBeNull() && (!xy.mightNotBeUndefined() || !xy.mightNotBeNull()))
        return op === "==" ? negate(realm, cond, loc) : makeBoolean(realm, cond, loc);
      // if xx is undefined/null and xy cannot be undefined/null then cond <=> x == undefined/null
      if ((!xx.mightNotBeUndefined() || !xx.mightNotBeNull()) && !xy.mightBeUndefined() && !xy.mightBeNull())
        return op === "==" ? makeBoolean(realm, cond, loc) : negate(realm, cond, loc);
    }
  }
  return equality;
}

function makeBoolean(realm: Realm, value: Value, loc: ?BabelNodeSourceLocation = undefined): Value {
  if (value.getType() === BooleanValue) return value;
  if (value instanceof ConcreteValue) return new BooleanValue(realm, ToBoolean(realm, value));
  invariant(value instanceof AbstractValue);
  let v = AbstractValue.createFromUnaryOp(realm, "!", value, true, value.expressionLocation);
  return AbstractValue.createFromUnaryOp(realm, "!", v, true, loc || value.expressionLocation);
}

function negate(realm: Realm, value: Value, loc: ?BabelNodeSourceLocation = undefined): Value {
  if (value instanceof ConcreteValue) return ValuesDomain.computeUnary(realm, "!", value);
  invariant(value instanceof AbstractValue);
  if (value.kind === "!") return makeBoolean(realm, value.args[0]);
  // todo #1001: remove this check once intrinsic objects can be properly nullable
  if (!(value instanceof AbstractObjectValue) || !value.isIntrinsic()) {
    if (!value.mightNotBeTrue()) return realm.intrinsics.false;
    if (!value.mightNotBeFalse()) return realm.intrinsics.true;
  }
  // If NaN is not an issue, invert binary ops
  if (value.args.length === 2 && !value.args[0].mightBeNumber() && !value.args[1].mightBeNumber()) {
    let invertedComparison;
    switch (value.kind) {
      case "===":
        invertedComparison = "!==";
        break;
      case "==":
        invertedComparison = "!=";
        break;
      case "!==":
        invertedComparison = "===";
        break;
      case "!=":
        invertedComparison = "==";
        break;
      case "<":
        invertedComparison = ">=";
        break;
      case "<=":
        invertedComparison = ">";
        break;
      case ">":
        invertedComparison = "<=";
        break;
      case ">=":
        invertedComparison = "<";
        break;
      default:
        break;
    }
    if (invertedComparison !== undefined) {
      let left = simplify(realm, value.args[0]);
      let right = simplify(realm, value.args[1]);
      return AbstractValue.createFromBinaryOp(realm, invertedComparison, left, right, loc || value.expressionLocation);
    }
    let invertedLogicalOp;
    switch (value.kind) {
      case "&&":
        invertedLogicalOp = "||";
        break;
      case "||":
        invertedLogicalOp = "&&";
        break;
      default:
        break;
    }
    if (invertedLogicalOp !== undefined) {
      let left = negate(realm, value.args[0]);
      let right = negate(realm, value.args[1]);
      return AbstractValue.createFromLogicalOp(realm, invertedLogicalOp, left, right, loc || value.expressionLocation);
    }
  }
  return AbstractValue.createFromUnaryOp(realm, "!", value, true, loc || value.expressionLocation);
}
