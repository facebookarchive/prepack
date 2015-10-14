/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { Realm } from "../realm.js";
import type { LexicalEnvironment } from "../environment.js";
import { Value, AbstractValue, UndefinedValue, NullValue, BooleanValue, NumberValue, ObjectValue, StringValue } from "../values/index.js";
import { GetValue } from "../methods/index.js";
import { HasProperty, HasSomeCompatibleType } from "../methods/index.js";
import { Add, AbstractEqualityComparison, StrictEqualityComparison, AbstractRelationalComparison, InstanceofOperator, IsToPrimitivePure, GetToPrimitivePureResultType, IsToNumberPure } from "../methods/index.js";
import { ToUint32, ToInt32, ToNumber, ToPrimitive, ToString, ToPropertyKey } from "../methods/index.js";
import { TypesDomain, ValuesDomain } from "../domains/index.js";
import * as t from "babel-types";
import type { BabelNodeBinaryExpression, BabelBinaryOperator } from "babel-types";
import invariant from "../invariant.js";

export default function (ast: BabelNodeBinaryExpression, strictCode: boolean, env: LexicalEnvironment, realm: Realm): Value {
  // evaluate left
  let lref = env.evaluate(ast.left, strictCode);
  let lval = GetValue(realm, lref);

  // evaluate right
  let rref = env.evaluate(ast.right, strictCode);
  let rval = GetValue(realm, rref);

  return computeBinary(realm, ast.operator, lval, rval);
}

// Returns result type if binary operation is pure (terminates, does not throw exception, does not read or write heap), otherwise undefined.
export function getPureBinaryOperationResultType(realm: Realm, op: BabelBinaryOperator, lval: Value, rval: Value): void | typeof Value {
  if (op === "+") {
    let ltype = GetToPrimitivePureResultType(realm, lval);
    let rtype = GetToPrimitivePureResultType(realm, rval);
    if (ltype === undefined || rtype === undefined) return undefined;
    if (ltype === StringValue || rtype === StringValue) return StringValue;
    return NumberValue;
  } else if (op === "<" || op === ">" || op === ">=" || op === "<=" || op === "!==" || op === "===" || op === "!=" || op === "==") {
    if (IsToPrimitivePure(realm, lval) && IsToPrimitivePure(realm, rval)) return BooleanValue;
    return undefined;
  } else if (op === ">>>" || op === "<<" || op === ">>" || op === "&" || op === "|" || op === "^" ||
             op === "**" || op === "%" || op === "/" || op === "*" || op === "-") {
    if (IsToNumberPure(realm, lval) && IsToNumberPure(realm, rval)) return NumberValue;
    return undefined;
  } else if (op === "in") {
    // TODO. Tricky. Needs deeper analysis. Can call arbitrary code e.g. when object is a Proxy => Side effects!
    return undefined;
  } else if (op === "instanceof") {
    // TODO. Tricky. Needs deeper analysis. Can throw exceptions, call arbitrary code => Side effects!
    return undefined;
  }
  invariant(false, "unimplemented " + op);
}

export function computeBinary(realm: Realm, op: BabelBinaryOperator, lval: Value, rval: Value): Value {
  // partial evaluation shortcut for a particular pattern (avoiding general throwIfNotConcrete check)
  if (op === "==" || op === "===" || op === "!=" || op === "!==") {
    if (!lval.mightNotBeObject() && HasSomeCompatibleType(realm, rval, NullValue, UndefinedValue) ||
      HasSomeCompatibleType(realm, lval, NullValue, UndefinedValue) && !rval.mightNotBeObject())
      return new BooleanValue(realm, op[0] !== "=");
  }

  if ((lval instanceof AbstractValue) || (rval instanceof AbstractValue)) {
    let type = getPureBinaryOperationResultType(realm, op, lval, rval);
    if (type !== undefined) {
      return realm.createAbstract(new TypesDomain(type), ValuesDomain.topVal, [lval, rval],
        ([lnode, rnode]) => t.binaryExpression(op, lnode, rnode));
    }
  }

  lval = lval.throwIfNotConcrete();
  rval = rval.throwIfNotConcrete();

  if (op === "+") {
    // ECMA262 12.8.3 The Addition Operator
    let lprim = ToPrimitive(realm, lval);
    let rprim = ToPrimitive(realm, rval);

    if (lprim instanceof StringValue || rprim instanceof StringValue) {
      let lstr = ToString(realm, lprim);
      let rstr = ToString(realm, rprim);
      return new StringValue(realm, lstr + rstr);
    }

    let lnum = ToNumber(realm, lprim);
    let rnum = ToNumber(realm, rprim);
    return Add(realm, lnum, rnum);
  } else if (op === "<" || op === ">" || op === ">=" || op === "<=") {
    // ECMA262 12.10.3
    if (op === "<") {
      let r = AbstractRelationalComparison(realm, lval, rval, true);
      if (r instanceof UndefinedValue) {
        return realm.intrinsics.false;
      } else {
        return r;
      }
    } else if (op === "<=") {
      let r = AbstractRelationalComparison(realm, rval, lval, false);
      if (r instanceof UndefinedValue || (r instanceof BooleanValue && r.value)) {
        return realm.intrinsics.false;
      } else {
        return realm.intrinsics.true;
      }
    } else if (op === ">") {
      let r = AbstractRelationalComparison(realm, rval, lval, false);
      if (r instanceof UndefinedValue) {
        return realm.intrinsics.false;
      } else {
        return r;
      }
    } else if (op === ">=") {
      let r = AbstractRelationalComparison(realm, lval, rval, true);
      if (r instanceof UndefinedValue || (r instanceof BooleanValue && r.value)) {
        return realm.intrinsics.false;
      } else {
        return realm.intrinsics.true;
      }
    }
  } else if (op === ">>>") {
    // ECMA262 12.9.5.1
    let lnum = ToUint32(realm, lval);
    let rnum = ToUint32(realm, rval);

    return new NumberValue(realm, lnum >>> rnum);
  } else if (op === "<<" || op === ">>") {
    let lnum = ToInt32(realm, lval);
    let rnum = ToUint32(realm, rval);

    if (op === "<<") {
      // ECMA262 12.9.3.1
      return new NumberValue(realm, lnum << rnum);
    } else if (op === ">>") {
      // ECMA262 12.9.4.1
      return new NumberValue(realm, lnum >> rnum);
    }
  } else if (op === "**") {
    // ECMA262 12.6.3

    // 5. Let base be ? ToNumber(leftValue).
    let base = ToNumber(realm, lval);

    // 6. Let exponent be ? ToNumber(rightValue).
    let exponent = ToNumber(realm, rval);

    // 7. Return the result of Applying the ** operator with base and exponent as specified in 12.7.3.4.
    return new NumberValue(realm, Math.pow(base, exponent));
  } else if (op === "%" || op === "/" || op === "*" || op === "-") {
    // ECMA262 12.7.3
    let lnum = ToNumber(realm, lval);
    let rnum = ToNumber(realm, rval);

    if (isNaN(rnum)) return realm.intrinsics.NaN;
    if (isNaN(lnum)) return realm.intrinsics.NaN;

    if (op === "-") {
      return Add(realm, lnum, rnum, true);
    } else if (op === "%") {
      // The sign of the result equals the sign of the dividend.
      // If the dividend is an infinity, or the divisor is a zero, or both, the result is NaN.
      // If the dividend is finite and the divisor is an infinity, the result equals the dividend.
      // If the dividend is a zero and the divisor is nonzero and finite, the result is the same as the dividend.
      return new NumberValue(realm, lnum % rnum);
    } else if (op === "/") {
      // The sign of the result is positive if both operands have the same sign, negative if the operands have different signs.
      // Division of an infinity by an infinity results in NaN.
      // Division of an infinity by a zero results in an infinity. The sign is determined by the rule already stated above.
      // Division of an infinity by a nonzero finite value results in a signed infinity. The sign is determined by the rule already stated above.
      // Division of a finite value by an infinity results in zero. The sign is determined by the rule already stated above.
      // Division of a zero by a zero results in NaN; division of zero by any other finite value results in zero, with the sign determined by the rule already stated above.
      // Division of a nonzero finite value by a zero results in a signed infinity. The sign is determined by the rule already stated above.
      return new NumberValue(realm, lnum / rnum);
    } else if (op === "*") {
      // The sign of the result is positive if both operands have the same sign, negative if the operands have different signs.
      // Multiplication of an infinity by a zero results in NaN.
      // Multiplication of an infinity by an infinity results in an infinity. The sign is determined by the rule already stated above.
      // Multiplication of an infinity by a finite nonzero value results in a signed infinity. The sign is determined by the rule already stated above.
      return new NumberValue(realm, lnum * rnum);
    }
  } else if (op === "!==") {
    return new BooleanValue(realm, !StrictEqualityComparison(realm, lval, rval));
  } else if (op === "===") {
    return new BooleanValue(realm, StrictEqualityComparison(realm, lval, rval));
  } else if (op === "!=") {
    return new BooleanValue(realm, !AbstractEqualityComparison(realm, lval, rval));
  } else if (op === "==") {
    return new BooleanValue(realm, AbstractEqualityComparison(realm, lval, rval));
  } else if (op === "&" || op === "|" || op === "^") {
    // ECMA262 12.12.3

    // 5. Let lnum be ? ToInt32(lval).
    let lnum: number = ToInt32(realm, lval);

    // 6. Let rnum be ? ToInt32(rval).
    let rnum: number = ToInt32(realm, rval);

    // 7. Return the result of applying the bitwise operator @ to lnum and rnum. The result is a signed 32 bit integer.
    if (op === "&") {
      return new NumberValue(realm, lnum & rnum);
    } else if (op === "|") {
      return new NumberValue(realm, lnum | rnum);
    } else if (op === "^") {
      return new NumberValue(realm, lnum ^ rnum);
    }
  } else if (op === "in") {
    // ECMA262 12.10.3

    // 5. If Type(rval) is not Object, throw a TypeError exception.
    if (!(rval instanceof ObjectValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 6. Return ? HasProperty(rval, ToPropertyKey(lval)).
    return new BooleanValue(realm, HasProperty(realm, rval, ToPropertyKey(realm, lval)));
  } else if (op === "instanceof") {
    // ECMA262 12.10.3

    // 5. Return ? InstanceofOperator(lval, rval).;
    return new BooleanValue(realm, InstanceofOperator(realm, lval, rval));
  }

  invariant(false, "unimplemented " + op);
}
