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
import { AbstractValue, BooleanValue, ConcreteValue, Value } from "../values/index.js";
import { Path } from "../singletons.js";

export default function simplifyAndRefineAbstractValue(
  realm: Realm,
  isCondition: boolean, // The value is only used after converting it to a Boolean
  value: AbstractValue
): Value {
  let savedHandler = realm.errorHandler;
  let savedIsReadOnly = realm.isReadOnly;
  realm.isReadOnly = true;
  try {
    realm.errorHandler = () => {
      throw new FatalError();
    };
    return simplify(realm, value, isCondition);
  } catch (e) {
    return value;
  } finally {
    realm.errorHandler = savedHandler;
    realm.isReadOnly = savedIsReadOnly;
  }
}

function simplify(realm, value: Value, isCondition: boolean = false): Value {
  if (value instanceof ConcreteValue) return value;
  invariant(value instanceof AbstractValue);
  let loc = value.expressionLocation;
  let op = value.kind;
  switch (op) {
    case "!": {
      let [x0] = value.args;
      let x = simplify(realm, x0, true);
      return negate(realm, x, loc, x0.equals(x) ? value : undefined);
    }
    case "||":
    case "&&": {
      let [x0, y0] = value.args;
      let x = simplify(realm, x0);
      let y = simplify(realm, y0);
      if (x instanceof AbstractValue && x.equals(y)) return x;
      // true && y <=> y
      // true || y <=> true
      if (!x.mightNotBeTrue()) return op === "&&" ? y : x;
      // (x == false) && y <=> x
      // false || y <=> y
      if (!x.mightNotBeFalse()) return op === "||" ? y : x;
      if (isCondition || (x.getType() === BooleanValue && y.getType() === BooleanValue)) {
        // (x: boolean) && true <=> x
        // x || true <=> true
        if (!y.mightNotBeTrue()) return op === "&&" ? x : realm.intrinsics.true;
        // (x: boolean) && false <=> false
        // (x: boolean) || false <=> x
        if (!y.mightNotBeFalse()) return op === "||" ? x : realm.intrinsics.false;
      }
      if (
        op === "||" &&
        y instanceof AbstractValue &&
        y.kind === "||" &&
        x.equals(y.args[0]) &&
        !y.args[1].mightNotBeTrue()
      )
        return y;
      if (x.equals(x0) && y.equals(y0)) return value;
      return AbstractValue.createFromLogicalOp(realm, (value.kind: any), x, y, loc);
    }
    case "==":
    case "!=":
    case "===":
    case "!==":
      return simplifyEquality(realm, value);
    case "conditional": {
      let [c0, x0, y0] = value.args;
      let c = simplify(realm, c0, true);
      let cs = simplify(realm, c0);
      let x = simplify(realm, x0);
      let y = simplify(realm, y0);
      if (!c.mightNotBeTrue()) return x;
      if (!c.mightNotBeFalse()) return y;
      invariant(c instanceof AbstractValue);
      if (Path.implies(c)) return x;
      let notc = AbstractValue.createFromUnaryOp(realm, "!", c);
      if (!notc.mightNotBeTrue()) return y;
      if (!notc.mightNotBeFalse()) return x;
      invariant(notc instanceof AbstractValue);
      if (Path.implies(notc)) return y;
      if (Path.implies(AbstractValue.createFromBinaryOp(realm, "===", value, x))) return x;
      if (Path.implies(AbstractValue.createFromBinaryOp(realm, "!==", value, x))) return y;
      if (Path.implies(AbstractValue.createFromBinaryOp(realm, "!==", value, y))) return x;
      if (Path.implies(AbstractValue.createFromBinaryOp(realm, "===", value, y))) return y;
      // c ? x : x <=> x
      if (x.equals(y)) return x;
      // x ? x : y <=> x || y
      if (cs.equals(x)) return AbstractValue.createFromLogicalOp(realm, "||", x, y, loc);
      // y ? x : y <=> y && x
      if (cs.equals(y)) return AbstractValue.createFromLogicalOp(realm, "&&", y, x, loc);
      // c ? (c ? xx : xy) : y <=> c ? xx : y
      if (x instanceof AbstractValue && x.kind === "conditional") {
        let [xc, xx] = x.args;
        if (c.equals(xc)) return AbstractValue.createFromConditionalOp(realm, c, xx, y);
      }
      // c ? x : (c ? y : z) : z <=> c ? x : z
      if (y instanceof AbstractValue && y.kind === "conditional") {
        let [yc, , z] = y.args;
        if (c.equals(yc)) return AbstractValue.createFromConditionalOp(realm, c, x, z);
      }
      if (x.getType() === BooleanValue && y.getType() === BooleanValue) {
        // c ? true : false <=> c
        if (!x.mightNotBeTrue() && !y.mightNotBeFalse()) return c;
        // c ? false : true <=> !c
        if (!x.mightNotBeFalse() && !y.mightNotBeTrue())
          return AbstractValue.createFromUnaryOp(realm, "!", c, true, loc);
      }
      if (c.equals(c0) && x.equals(x0) && y.equals(y0)) return value;
      return AbstractValue.createFromConditionalOp(realm, c, x, y, value.expressionLocation);
    }
    case "abstractConcreteUnion": {
      // The union of an abstract value with one or more concrete values.
      if (realm.pathConditions.length === 0) return value;
      let [abstractValue, ...concreteValues] = value.args;
      invariant(abstractValue instanceof AbstractValue);
      let remainingConcreteValues = [];
      for (let concreteValue of concreteValues) {
        if (Path.implies(AbstractValue.createFromBinaryOp(realm, "!==", value, concreteValue))) continue;
        if (Path.implies(AbstractValue.createFromBinaryOp(realm, "===", value, concreteValue))) return concreteValue;
        remainingConcreteValues.push(concreteValue);
      }
      if (remainingConcreteValues.length === 0) return abstractValue;
      if (remainingConcreteValues.length === concreteValues.length) return value;
      return AbstractValue.createAbstractConcreteUnion(realm, abstractValue, ...remainingConcreteValues);
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
  if (v instanceof ConcreteValue) return new BooleanValue(realm, !ToBoolean(realm, v));
  invariant(v instanceof AbstractValue);
  return AbstractValue.createFromUnaryOp(realm, "!", v, true, loc || value.expressionLocation);
}

function negate(
  realm: Realm,
  value: Value,
  loc: ?BabelNodeSourceLocation = undefined,
  unsimplifiedNegation: void | Value = undefined
): Value {
  if (value instanceof ConcreteValue) return ValuesDomain.computeUnary(realm, "!", value);
  invariant(value instanceof AbstractValue);
  if (value.kind === "!") {
    let [x] = value.args;
    if (x.getType() === BooleanValue) return x;
    if (unsimplifiedNegation !== undefined) return unsimplifiedNegation;
    return makeBoolean(realm, x, loc);
  }
  if (!value.mightNotBeTrue()) return realm.intrinsics.false;
  if (!value.mightNotBeFalse()) return realm.intrinsics.true;
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
  if (unsimplifiedNegation !== undefined) return unsimplifiedNegation;
  return AbstractValue.createFromUnaryOp(realm, "!", value, true, loc || value.expressionLocation);
}
