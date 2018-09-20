/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { BabelNodeSourceLocation } from "@babel/types";
import { FatalError, InfeasiblePathError } from "../errors.js";
import { ValuesDomain } from "../domains/index.js";
import invariant from "../invariant.js";
import { Realm } from "../realm.js";
import { AbstractValue, BooleanValue, ConcreteValue, Value } from "../values/index.js";
import { Path, To } from "../singletons.js";
import EmptyValue from "../values/EmptyValue.js";
import { createOperationDescriptor } from "./generator.js";
import { NullValue, NumberValue, ObjectValue, PrimitiveValue, UndefinedValue } from "../values/index.js";

export default function simplifyAndRefineAbstractValue(
  realm: Realm,
  isCondition: boolean, // The value is only used after converting it to a Boolean
  value: AbstractValue
): Value {
  if (value.intrinsicName !== undefined) return value;
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
    let result = simplify(realm, value, isCondition, 0);
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

function simplify(realm, value: Value, isCondition: boolean = false, depth: number): Value {
  if (value instanceof ConcreteValue || depth > 5) return value;
  invariant(value instanceof AbstractValue);
  if (isCondition || value.getType() === BooleanValue) {
    if (Path.implies(value, depth + 1)) return realm.intrinsics.true;
    if (Path.impliesNot(value, depth + 1)) return realm.intrinsics.false;
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
        let xx = simplify(realm, x00, true, depth + 1);
        if (isCondition || xx.getType() === BooleanValue) return xx;
      }
      return negate(realm, x0, depth + 1, loc, value, isCondition);
    }
    case "||":
    case "&&": {
      let [x0, y0] = value.args;
      let x = simplify(realm, x0, isCondition, depth + 1);
      let y = simplify(realm, y0, isCondition, depth + 1);
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
      if (op === "||") {
        if (y instanceof AbstractValue && y.kind === "||") {
          // x || x || y <=> x || y
          if (x.equals(y.args[0])) return y;
          if (x instanceof AbstractValue && x.kind === "!") {
            // !x0 || y0 || x0 <=> true, if isCondition
            if (isCondition && x.args[0].equals(y.args[1])) return realm.intrinsics.true;
          }
        }
      }
      if (op === "&&") {
        if (x instanceof AbstractValue) {
          if (x.kind === "&&") {
            // (x && y) && x <=> x && y, if isCondition
            if (isCondition && x.args[0].equals(y)) return x;
            // (x && y) && y <=> x && y
            if (x.args[1].equals(y)) return x;
          } else if (x.kind === "!") {
            // !x && x <=> false, if isCondition
            if (isCondition && x.args[0].equals(y)) return realm.intrinsics.false;
          }
        }
        if (y instanceof AbstractValue && y.kind === "&&") {
          // x && (x && y) <=> x && y
          // y && (x && y) <=> x && y
          if (x.equals(y.args[0]) || x.equals(y.args[1])) return y;
        }
        // x && (x && y || x && z) <=> x && (y || z)
        if (y instanceof AbstractValue && y.kind === "||") {
          let [yx, yy] = y.args;
          let yxs, yys;
          if (yx instanceof AbstractValue && yx.kind === "&&") {
            if (x.equals(yx.args[0])) yxs = yx.args[1];
            else if (x.equals(yx.args[1])) yxs = yx.args[0];
          }
          if (yy instanceof AbstractValue && yy.kind === "&&") {
            if (x.equals(yy.args[0])) yys = yy.args[1];
            else if (x.equals(yy.args[1])) yys = yy.args[0];
          }
          if (yxs !== undefined || yys !== undefined) {
            let ys = AbstractValue.createFromLogicalOp(realm, "||", yxs || yx, yys || yy, undefined, isCondition);
            return AbstractValue.createFromLogicalOp(realm, "&&", x, ys, undefined, isCondition);
          }
        }
      }
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
                createOperationDescriptor("CANNOT_BECOME_OBJECT"),
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
        AbstractValue.createFromBinaryOp(realm, op, args[0], args[1], loc, undefined, isCondition, true)
      );
    case "==":
    case "!=":
    case "===":
    case "!==":
      return simplifyEquality(realm, value, depth + 1);
    case "conditional": {
      let [c0, x0, y0] = value.args;
      let c = simplify(realm, c0, true, depth + 1);
      let x, y;
      if (c0 instanceof AbstractValue && c.mightBeFalse() && c.mightBeTrue()) {
        try {
          x = Path.withCondition(c0, () => simplify(realm, x0, isCondition, depth + 1));
        } catch (e) {
          if (e instanceof InfeasiblePathError) {
            // We now know that c0 cannot be be true on this path
            return simplify(realm, y0, isCondition, depth + 1);
          }
          throw e;
        }
        try {
          y = Path.withInverseCondition(c0, () => simplify(realm, y0, isCondition, depth + 1));
        } catch (e) {
          if (e instanceof InfeasiblePathError) {
            // We now know that c0 cannot be be false on this path
            return x;
          }
          throw e;
        }
      }
      let cIsFalse = !c.mightNotBeFalse();
      let cIsTrue = !c.mightNotBeTrue();
      if (x === undefined && !cIsFalse) x = simplify(realm, x0, isCondition, depth + 1);
      if (cIsTrue) {
        invariant(x !== undefined); // cIsTrue ==> !cIsFalse
        return x;
      }
      if (y === undefined) y = simplify(realm, y0, isCondition, depth + 1);
      if (cIsFalse) return y;
      invariant(x !== undefined); // because !csIsFalse
      invariant(c instanceof AbstractValue);
      if (Path.implies(c, depth + 1)) return x;
      let notc = AbstractValue.createFromUnaryOp(realm, "!", c, true, loc, isCondition, true);
      if (!notc.mightNotBeTrue()) return y;
      if (!notc.mightNotBeFalse()) return x;
      invariant(notc instanceof AbstractValue);
      if (Path.implies(notc, depth + 1)) return y;
      if (!isCondition) {
        if (Path.implies(AbstractValue.createFromBinaryOp(realm, "===", value, x), depth + 1)) return x;
        if (!x.mightBeNumber() && Path.implies(AbstractValue.createFromBinaryOp(realm, "!==", value, x), depth + 1))
          return y;
        if (!y.mightBeNumber() && Path.implies(AbstractValue.createFromBinaryOp(realm, "!==", value, y), depth + 1))
          return x;
        if (Path.implies(AbstractValue.createFromBinaryOp(realm, "===", value, y), depth + 1)) return y;
      }
      // c ? x : x <=> x
      if (x.equals(y)) return x;
      // x ? x : y <=> x || y
      let cs = isCondition ? c : simplify(realm, c0, false, depth + 1);
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
      if (realm.pathConditions.isEmpty()) return value;
      let [abstractValue, concreteValues] = AbstractValue.dischargeValuesFromUnion(realm, value);
      invariant(abstractValue instanceof AbstractValue);
      let remainingConcreteValues = [];
      for (let concreteValue of concreteValues) {
        if (Path.implies(AbstractValue.createFromBinaryOp(realm, "!==", value, concreteValue), depth + 1)) continue;
        if (Path.implies(AbstractValue.createFromBinaryOp(realm, "===", value, concreteValue), depth + 1))
          return concreteValue;
        remainingConcreteValues.push(concreteValue);
      }
      if (remainingConcreteValues.length === 0) return abstractValue;
      if (remainingConcreteValues.length === concreteValues.length) return value;
      return AbstractValue.createAbstractConcreteUnion(realm, abstractValue, remainingConcreteValues);
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

function simplifyNullCheck(
  realm: Realm,
  op: "===" | "==" | "!==" | "!=",
  value: Value,
  depth: number,
  loc: ?BabelNodeSourceLocation
): void | Value {
  if (op === "==" || op === "!=") {
    if (!value.mightNotBeNull() || !value.mightNotBeUndefined())
      return op === "==" ? realm.intrinsics.true : realm.intrinsics.false;
    if (!value.mightBeNull() && !value.mightBeUndefined())
      return op === "==" ? realm.intrinsics.false : realm.intrinsics.true;
  } else {
    if (!value.mightNotBeNull()) return op === "===" ? realm.intrinsics.true : realm.intrinsics.false;
    if (!value.mightBeNull()) return op === "===" ? realm.intrinsics.false : realm.intrinsics.true;
  }
  invariant(value instanceof AbstractValue); // concrete values will either be null or not null
  // try to simplify "(cond ? x : y) op null" to just "cond" or "!cond"
  // failing that, use "cond ? x op null : y op null" if either of the subexpressions simplify
  if (value.kind === "conditional" && depth < 10) {
    let [cond, x, y] = value.args;
    let sx = simplifyNullCheck(realm, op, x, depth + 1, loc);
    let sy = simplifyNullCheck(realm, op, y, depth + 1, loc);
    if (sx !== undefined && sy !== undefined) {
      if (!sx.mightNotBeTrue() && !sy.mightNotBeFalse()) return makeBoolean(realm, cond, loc);
      if (!sx.mightNotBeFalse() && !sy.mightNotBeTrue()) return negate(realm, cond, depth + 1, loc);
    }
    if (sx !== undefined || sy !== undefined) {
      if (sx === undefined)
        sx = AbstractValue.createFromBinaryOp(
          realm,
          op,
          x,
          realm.intrinsics.null,
          x.expressionLocation,
          undefined,
          false,
          true
        );
      if (sy === undefined)
        sy = AbstractValue.createFromBinaryOp(
          realm,
          op,
          y,
          realm.intrinsics.null,
          y.expressionLocation,
          undefined,
          false,
          true
        );
      return AbstractValue.createFromConditionalOp(realm, cond, sx, sy, loc, true, true);
    }
  }
}

function simplifyUndefinedCheck(
  realm: Realm,
  op: "===" | "==" | "!==" | "!=",
  value: Value,
  depth: number,
  loc: ?BabelNodeSourceLocation
): void | Value {
  if (op === "==" || op === "!=") {
    if (!value.mightNotBeNull() || !value.mightNotBeUndefined())
      return op === "==" ? realm.intrinsics.true : realm.intrinsics.false;
    if (!value.mightBeNull() && !value.mightBeUndefined())
      return op === "==" ? realm.intrinsics.false : realm.intrinsics.true;
  } else {
    if (!value.mightNotBeUndefined()) return op === "===" ? realm.intrinsics.true : realm.intrinsics.false;
    if (!value.mightBeUndefined()) return op === "===" ? realm.intrinsics.false : realm.intrinsics.true;
  }
  invariant(value instanceof AbstractValue); // concrete values will either be undefined or not undefined
  // try to simplify "(cond ? x : y) op undefined" to just "cond" or "!cond"
  // failing that, use "cond ? x op undefined : y op undefined" if either of the subexpressions simplify
  if (value.kind === "conditional" && depth < 10) {
    let [cond, x, y] = value.args;
    let sx = simplifyUndefinedCheck(realm, op, x, depth + 1, loc);
    let sy = simplifyUndefinedCheck(realm, op, y, depth + 1, loc);
    if (sx !== undefined && sy !== undefined) {
      if (!sx.mightNotBeTrue() && !sy.mightNotBeFalse()) return makeBoolean(realm, cond, loc);
      if (!sx.mightNotBeFalse() && !sy.mightNotBeTrue()) return negate(realm, cond, depth + 1, loc);
    }
    if (sx !== undefined || sy !== undefined) {
      if (sx === undefined)
        sx = AbstractValue.createFromBinaryOp(
          realm,
          op,
          x,
          realm.intrinsics.undefined,
          x.expressionLocation,
          undefined,
          false,
          true
        );
      if (sy === undefined)
        sy = AbstractValue.createFromBinaryOp(
          realm,
          op,
          y,
          realm.intrinsics.undefined,
          y.expressionLocation,
          undefined,
          false,
          true
        );
      return AbstractValue.createFromConditionalOp(realm, cond, sx, sy, loc, true, true);
    }
  }
}

function simplifyEquality(realm: Realm, equality: AbstractValue, depth: number): Value {
  let loc = equality.expressionLocation;
  let op = equality.kind;
  let [x, y] = equality.args;
  if (y instanceof EmptyValue) return equality;
  if (x instanceof ConcreteValue) [x, y] = [y, x];
  if (op === "===" || op === "==" || op === "!==" || op === "==") {
    if (!x.mightNotBeNull()) {
      let sy = simplifyNullCheck(realm, op, y, depth + 1);
      if (sy !== undefined) return sy;
    }
    if (!y.mightNotBeNull()) {
      let sx = simplifyNullCheck(realm, op, x, depth + 1);
      if (sx !== undefined) return sx;
    }
    if (!x.mightNotBeUndefined()) {
      let sy = simplifyUndefinedCheck(realm, op, y, depth + 1);
      if (sy !== undefined) return sy;
    }
    if (!y.mightNotBeUndefined()) {
      let sx = simplifyUndefinedCheck(realm, op, x, depth + 1);
      if (sx !== undefined) return sx;
    }
  }
  if (op === "===") {
    let xType = x.getType();
    let yType = y.getType();
    if (xType !== yType) {
      if (xType === Value || xType === PrimitiveValue || yType === Value || yType === PrimitiveValue) return equality;
      if (
        (Value.isTypeCompatibleWith(xType, NumberValue) && Value.isTypeCompatibleWith(yType, NumberValue)) ||
        (Value.isTypeCompatibleWith(xType, ObjectValue) && Value.isTypeCompatibleWith(yType, ObjectValue))
      )
        return equality;
      return realm.intrinsics.false;
    } else if (x instanceof AbstractValue && x.kind === "conditional") {
      let [cond, xx, xy] = x.args;
      // ((cond ? xx : xy) === y) && xx === y && xy !== y <=> cond
      if (xx.equals(y) && !xy.equals(y)) return cond;
      // ((!cond ? xx : xy) === y) && xx !== y && xy === y <=> !cond
      if (!xx.equals(y) && xy.equals(y)) return negate(realm, cond, depth + 1, loc);
    } else if (y instanceof AbstractValue && y.kind === "conditional") {
      let [cond, yx, yy] = y.args;
      // (x === (cond ? yx : yy) === y) && x === yx && x !== yy <=> cond
      if (yx.equals(x) && !yy.equals(x)) return cond;
      // (x === (!cond ? yx : yy) === y) && x !== yx && x === yy <=> !cond
      if (!x.equals(yx) && x.equals(yy)) return negate(realm, cond, depth + 1, loc);
    }
  } else if (op === "==") {
    let xType = x.getType();
    let xIsNullOrUndefined = xType === NullValue || xType === UndefinedValue;
    let yType = y.getType();
    let yIsNullOrUndefined = yType === NullValue || yType === UndefinedValue;
    // If x and y are both known to be null/undefined we should never get here because both should be concrete values.
    invariant(!xIsNullOrUndefined || !yIsNullOrUndefined);
    if (xIsNullOrUndefined) {
      return yType === Value || yType === PrimitiveValue ? equality : realm.intrinsics.false;
    }
    if (yIsNullOrUndefined) {
      return xType === Value || xType === PrimitiveValue ? equality : realm.intrinsics.false;
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
  depth: number = 0,
  loc: ?BabelNodeSourceLocation = undefined,
  unsimplifiedNegation: void | Value = undefined,
  isCondition?: boolean
): Value {
  if (value instanceof ConcreteValue) return ValuesDomain.computeUnary(realm, "!", value);
  invariant(value instanceof AbstractValue);
  value = simplify(realm, value, true, depth + 1);
  if (!value.mightNotBeTrue()) return realm.intrinsics.false;
  if (!value.mightNotBeFalse()) return realm.intrinsics.true;
  invariant(value instanceof AbstractValue);
  if (value.kind === "!") {
    let [x] = value.args;
    if (isCondition || x.getType() === BooleanValue) return simplify(realm, x, true, depth + 1);
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
      let left = simplify(realm, value.args[0], false, depth + 1);
      let right = simplify(realm, value.args[1], false, depth + 1);
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
      let left = negate(realm, value.args[0], depth + 1);
      let right = negate(realm, value.args[1], depth + 1);
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
