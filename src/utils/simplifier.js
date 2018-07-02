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
import { FatalError, InfeasiblePathError } from "../errors.js";
import { ValuesDomain } from "../domains/index.js";
import invariant from "../invariant.js";
import { Realm } from "../realm.js";
import { AbstractValue, BooleanValue, ConcreteValue, Value } from "../values/index.js";
import { Path, To } from "../singletons.js";
import EmptyValue from "../values/EmptyValue";
import * as t from "babel-types";

export default function simplifyAndRefineAbstractValue(
  realm: Realm,
  isCondition: boolean, // The value is only used after converting it to a Boolean
  value: AbstractValue
): Value {
  let savedHandler = realm.errorHandler;
  let savedIsReadOnly = realm.isReadOnly;
  realm.isReadOnly = true;
  let isRootSimplification = false;
  realm.statistics.simplificationAttempts++;

  if (!realm.inSimplificationPath) {
    realm.inSimplificationPath = isRootSimplification = true;
  }
  try {
    realm.errorHandler = diagnostic => {
      if (diagnostic.errorCode === "PP0029") {
        throw new FatalError(`${diagnostic.errorCode}: ${diagnostic.message}`);
      }
      throw new FatalError();
    };
    let result = simplify(realm, value, isCondition);
    if (result !== value) realm.statistics.simplifications++;
    return result;
  } catch (e) {
    if (e.name === "Invariant Violation") throw e;
    if (e instanceof FatalError && typeof e.message === "string" && e.message.includes("PP0029")) {
      if (isRootSimplification) {
        return value;
      }
      throw e;
    }
    return value;
  } finally {
    if (isRootSimplification) {
      realm.abstractValueImpliesCounter = 0;
      realm.inSimplificationPath = false;
    }
    realm.errorHandler = savedHandler;
    realm.isReadOnly = savedIsReadOnly;
  }
}

function simplify(realm, value: Value, isCondition: boolean = false): Value {
  if (value instanceof ConcreteValue) return value;
  invariant(value instanceof AbstractValue);
  if (isCondition || value.getType() === BooleanValue) {
    if (Path.implies(value)) return realm.intrinsics.true;
    if (Path.impliesNot(value)) return realm.intrinsics.false;
  }
  let loc = value.expressionLocation;
  let op = value.kind;
  switch (op) {
    case "!": {
      let [x0] = value.args;
      invariant(x0 instanceof AbstractValue);
      if (x0.kind === "!") {
        invariant(x0 instanceof AbstractValue);
        let [x00] = x0.args;
        let xx = simplify(realm, x00, true);
        if (isCondition || xx.getType() === BooleanValue) return xx;
      }
      return negate(realm, x0, loc, value, isCondition);
    }
    case "||":
    case "&&": {
      let [x0, y0] = value.args;
      let x = simplify(realm, x0, isCondition);
      let y = simplify(realm, y0, isCondition);
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
      if (realm.instantRender.enabled) {
        if (op === "||" && x0 instanceof AbstractValue && y0 instanceof AbstractValue) {
          if (x0.kind === "===" && y0.kind === "===") {
            let [xa, xb] = x0.args;
            let [ya, yb] = y0.args;
            if (xa.equals(ya) && !xb.equals(yb) && nullOrUndefined(xb) && nullOrUndefined(yb)) return rewrite(xa);
            else if (xb.equals(yb) && !xa.equals(ya) && nullOrUndefined(xa) && nullOrUndefined(ya)) return rewrite(xb);
            else if (xa.equals(yb) && !xb.equals(ya) && nullOrUndefined(xb) && nullOrUndefined(ya)) return rewrite(xa);
            else if (xb.equals(ya) && !xa.equals(yb) && nullOrUndefined(xa) && nullOrUndefined(yb)) return rewrite(xb);
            function nullOrUndefined(z: Value) {
              return !z.mightNotBeNull() || !z.mightNotBeUndefined();
            }
            function rewrite(z: Value) {
              return AbstractValue.createFromBuildFunction(
                realm,
                BooleanValue,
                [xa],
                ([n]) => {
                  let callFunc = t.identifier("global.__cannotBecomeObject");
                  return t.callExpression(callFunc, [n]);
                },
                { kind: "global.__cannotBecomeObject(A)" }
              );
            }
          }
        }
      }
      if (x.equals(x0) && y.equals(y0)) return value;
      return AbstractValue.createFromLogicalOp(realm, (value.kind: any), x, y, loc, isCondition, true);
    }
    case "<":
    case "<=":
    case ">":
    case ">=":
      return distributeConditional(realm, value, isCondition, args =>
        AbstractValue.createFromBinaryOp(realm, op, args[0], args[1], loc, undefined, isCondition)
      );
    case "==":
    case "!=":
    case "===":
    case "!==":
      return simplifyEquality(realm, value);
    case "conditional": {
      let [c0, x0, y0] = value.args;
      let c = simplify(realm, c0, true);
      let x, y;
      if (c0 instanceof AbstractValue && c.mightBeFalse() && c.mightBeTrue()) {
        try {
          x = Path.withCondition(c0, () => simplify(realm, x0, isCondition));
        } catch (e) {
          if (e instanceof InfeasiblePathError) {
            // We now know that c0 cannot be be true on this path
            return simplify(realm, y0, isCondition);
          }
          throw e;
        }
        try {
          y = Path.withInverseCondition(c0, () => simplify(realm, y0, isCondition));
        } catch (e) {
          if (e instanceof InfeasiblePathError) {
            // We now know that c0 cannot be be false on this path
            return x;
          }
          throw e;
        }
      }
      if (x === undefined) x = simplify(realm, x0, isCondition);
      if (y === undefined) y = simplify(realm, y0, isCondition);
      if (!c.mightNotBeTrue()) return x;
      if (!c.mightNotBeFalse()) return y;
      invariant(c instanceof AbstractValue);
      if (Path.implies(c)) return x;
      let notc = AbstractValue.createFromUnaryOp(realm, "!", c, true, loc, isCondition, true);
      if (!notc.mightNotBeTrue()) return y;
      if (!notc.mightNotBeFalse()) return x;
      invariant(notc instanceof AbstractValue);
      if (Path.implies(notc)) return y;
      if (!isCondition) {
        if (Path.implies(AbstractValue.createFromBinaryOp(realm, "===", value, x))) return x;
        if (!x.mightBeNumber() && Path.implies(AbstractValue.createFromBinaryOp(realm, "!==", value, x))) return y;
        if (!y.mightBeNumber() && Path.implies(AbstractValue.createFromBinaryOp(realm, "!==", value, y))) return x;
        if (Path.implies(AbstractValue.createFromBinaryOp(realm, "===", value, y))) return y;
      }
      // c ? x : x <=> x
      if (x.equals(y)) return x;
      // x ? x : y <=> x || y
      let cs = isCondition ? c : simplify(realm, c0);
      if (cs.equals(x)) return AbstractValue.createFromLogicalOp(realm, "||", x, y, loc, isCondition, true);
      // y ? x : y <=> y && x
      if (cs.equals(y)) return AbstractValue.createFromLogicalOp(realm, "&&", y, x, loc, isCondition, true);
      // c ? (c ? xx : xy) : y <=> c ? xx : y
      if (x instanceof AbstractValue && x.kind === "conditional") {
        let [xc, xx] = x.args;
        if (c.equals(xc))
          return AbstractValue.createFromConditionalOp(realm, c, xx, y, value.expressionLocation, isCondition, true);
      }
      // c ? x : (c ? y : z) : z <=> c ? x : z
      if (y instanceof AbstractValue && y.kind === "conditional") {
        let [yc, , z] = y.args;
        if (c.equals(yc))
          return AbstractValue.createFromConditionalOp(realm, c, x, z, value.expressionLocation, isCondition, true);
      }
      if (isCondition || (x.getType() === BooleanValue && y.getType() === BooleanValue)) {
        // c ? true : false <=> c
        if (!x.mightNotBeTrue() && !y.mightNotBeFalse()) return c;
        // c ? false : true <=> !c
        if (!x.mightNotBeFalse() && !y.mightNotBeTrue())
          return AbstractValue.createFromUnaryOp(realm, "!", c, true, loc, true);
      }
      if (c.equals(c0) && x.equals(x0) && y.equals(y0)) return value;
      return AbstractValue.createFromConditionalOp(realm, c, x, y, value.expressionLocation, isCondition, true);
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

function distributeConditional(
  realm: Realm,
  value: AbstractValue,
  isCondition: boolean,
  create: (Array<Value>) => Value
): Value {
  // Find a conditional argument
  let condition;
  let args = value.args;
  for (let arg of args)
    if (arg instanceof AbstractValue && arg.kind === "conditional") {
      if (condition === undefined) condition = arg.args[0];
      else if (condition !== arg.args[0]) return value; // giving up, multiple conditions involved
    }

  if (condition === undefined) return value; // no conditional found, nothing to do

  // We have at least one conditional argument; if there are more than one, they all share the same condition
  let leftArgs = args.slice(0);
  let rightArgs = args.slice(0);
  for (let i = 0; i < args.length; i++) {
    let arg = args[i];
    if (arg instanceof AbstractValue && arg.kind === "conditional") {
      leftArgs[i] = arg.args[1];
      rightArgs[i] = arg.args[2];
    }
  }

  return AbstractValue.createFromConditionalOp(
    realm,
    condition,
    create(leftArgs),
    create(rightArgs),
    condition.expressionLocation,
    isCondition,
    true
  );
}

function simplifyEquality(realm: Realm, equality: AbstractValue): Value {
  let loc = equality.expressionLocation;
  let op = equality.kind;
  let [x, y] = equality.args;
  if (y instanceof EmptyValue) return equality;
  if (x instanceof ConcreteValue) [x, y] = [y, x];
  if (x instanceof AbstractValue && x.kind === "conditional" && (!y.mightNotBeUndefined() || !y.mightNotBeNull())) {
    function simplified(v: Value) {
      return v instanceof AbstractValue ? v.kind !== op : true;
    }
    // try to simplify "(cond ? xx : xy) op undefined/null" to just "cond" or "!cond"
    let [cond, xx, xy] = x.args;
    invariant(cond instanceof AbstractValue); // otherwise the the conditional should not have been created
    if (op === "===" || op === "!==") {
      if (!y.mightNotBeUndefined()) {
        // if xx === undefined && xy !== undefined then cond <=> x === undefined
        if (!xx.mightNotBeUndefined() && !xy.mightBeUndefined())
          return op === "===" ? makeBoolean(realm, cond, loc) : negate(realm, cond, loc);
        // if xx !== undefined && xy === undefined then !cond <=> x === undefined
        if (!xx.mightBeUndefined() && !xy.mightNotBeUndefined())
          return op === "===" ? negate(realm, cond, loc) : makeBoolean(realm, cond, loc);
        // distribute equality test, creating more simplication opportunities
        let sxx = AbstractValue.createFromBinaryOp(realm, op, xx, realm.intrinsics.undefined, xx.expressionLocation);
        let sxy = AbstractValue.createFromBinaryOp(realm, op, xy, realm.intrinsics.undefined, xy.expressionLocation);
        if (simplified(sxx) || simplified(sxy))
          return AbstractValue.createFromConditionalOp(realm, cond, sxx, sxy, equality.expressionLocation, true);
      }
      if (!y.mightNotBeNull()) {
        // if xx === null && xy !== null then cond <=> x === null
        if (!xx.mightNotBeNull() && !xy.mightBeNull())
          return op === "===" ? makeBoolean(realm, cond, loc) : negate(realm, cond, loc);
        // if xx !== null && xy === null then !cond <=> x === null
        if (!xx.mightBeNull() && !xy.mightNotBeNull())
          return op === "===" ? negate(realm, cond, loc) : makeBoolean(realm, cond, loc);
        // distribute equality test, creating more simplication opportunities
        let sxx = AbstractValue.createFromBinaryOp(realm, op, xx, realm.intrinsics.null, xx.expressionLocation);
        let sxy = AbstractValue.createFromBinaryOp(realm, op, xy, realm.intrinsics.null, xy.expressionLocation);
        if (simplified(sxx) || simplified(sxy))
          return AbstractValue.createFromConditionalOp(realm, cond, sxx, sxy, equality.expressionLocation, true);
      }
    } else {
      invariant(op === "==" || op === "!=");
      // if xx cannot be undefined/null and xy is undefined/null then !cond <=> x == undefined/null
      if (!xx.mightBeUndefined() && !xx.mightBeNull() && (!xy.mightNotBeUndefined() || !xy.mightNotBeNull()))
        return op === "==" ? negate(realm, cond, loc) : makeBoolean(realm, cond, loc);
      // if xx is undefined/null and xy cannot be undefined/null then cond <=> x == undefined/null
      if ((!xx.mightNotBeUndefined() || !xx.mightNotBeNull()) && !xy.mightBeUndefined() && !xy.mightBeNull())
        return op === "==" ? makeBoolean(realm, cond, loc) : negate(realm, cond, loc);
      // distribute equality test, creating more simplication opportunities
      let sxx = AbstractValue.createFromBinaryOp(realm, op, xx, y, xx.expressionLocation);
      let sxy = AbstractValue.createFromBinaryOp(realm, op, xy, y, xy.expressionLocation);
      if (simplified(sxx) || simplified(sxy))
        return AbstractValue.createFromConditionalOp(realm, cond, sxx, sxy, equality.expressionLocation, true);
    }
  }
  return equality;
}

function makeBoolean(realm: Realm, value: Value, loc: ?BabelNodeSourceLocation = undefined): Value {
  if (value.getType() === BooleanValue) return value;
  if (value instanceof ConcreteValue) return new BooleanValue(realm, To.ToBoolean(realm, value));
  invariant(value instanceof AbstractValue);
  let v = AbstractValue.createFromUnaryOp(realm, "!", value, true, value.expressionLocation);
  if (v instanceof ConcreteValue) return new BooleanValue(realm, !To.ToBoolean(realm, v));
  invariant(v instanceof AbstractValue);
  return AbstractValue.createFromUnaryOp(realm, "!", v, true, loc || value.expressionLocation);
}

function negate(
  realm: Realm,
  value: Value,
  loc: ?BabelNodeSourceLocation = undefined,
  unsimplifiedNegation: void | Value = undefined,
  isCondition?: boolean
): Value {
  if (value instanceof ConcreteValue) return ValuesDomain.computeUnary(realm, "!", value);
  invariant(value instanceof AbstractValue);
  value = simplify(realm, value, true);
  if (!value.mightNotBeTrue()) return realm.intrinsics.false;
  if (!value.mightNotBeFalse()) return realm.intrinsics.true;
  invariant(value instanceof AbstractValue);
  if (value.kind === "!") {
    let [x] = value.args;
    if (isCondition || x.getType() === BooleanValue) return simplify(realm, x, true);
    if (unsimplifiedNegation !== undefined) return unsimplifiedNegation;
    return makeBoolean(realm, x, loc);
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
      return AbstractValue.createFromLogicalOp(
        realm,
        invertedLogicalOp,
        left,
        right,
        loc || value.expressionLocation,
        true
      );
    }
  }
  if (unsimplifiedNegation !== undefined) return unsimplifiedNegation;
  return AbstractValue.createFromUnaryOp(realm, "!", value, true, loc || value.expressionLocation, true);
}
