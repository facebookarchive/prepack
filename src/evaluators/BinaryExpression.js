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
import { ValuesDomain, TypesDomain } from "../domains/index.js";
import type { LexicalEnvironment } from "../environment.js";
import { CompilerDiagnostic, FatalError } from "../errors.js";
import {
  AbstractValue,
  BooleanValue,
  ConcreteValue,
  NullValue,
  NumberValue,
  IntegralValue,
  ObjectValue,
  StringValue,
  UndefinedValue,
  Value,
} from "../values/index.js";
import { Environment, To, Leak } from "../singletons.js";
import type { BabelNodeBinaryExpression, BabelBinaryOperator, BabelNodeSourceLocation } from "babel-types";
import invariant from "../invariant.js";

export default function(
  ast: BabelNodeBinaryExpression,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): Value {
  // evaluate left
  let lref = env.evaluate(ast.left, strictCode);
  let lval = Environment.GetValue(realm, lref);

  // evaluate right
  let rref = env.evaluate(ast.right, strictCode);
  let rval = Environment.GetValue(realm, rref);

  return computeBinary(realm, ast.operator, lval, rval, ast.left.loc, ast.right.loc, ast.loc);
}

let unknownValueOfOrToString = "might be an object with an unknown valueOf or toString or Symbol.toPrimitive method";

// Returns result type if binary operation is pure (terminates, does not throw exception, does not read or write heap), otherwise undefined.
export function getPureBinaryOperationResultType(
  realm: Realm,
  op: BabelBinaryOperator,
  lval: Value,
  rval: Value,
  lloc: ?BabelNodeSourceLocation,
  rloc: ?BabelNodeSourceLocation
): typeof Value {
  function leakOrReportErrorIfNotPure(purityTest: (Realm, Value) => boolean, typeIfPure: typeof Value): typeof Value {
    let leftPure = purityTest(realm, lval);
    let rightPure = purityTest(realm, rval);
    if (leftPure && rightPure) return typeIfPure;

    if (realm.isInPureScope()) {
      if (!leftPure) Leak.leakValue(realm, lval);
      if (!rightPure) Leak.leakValue(realm, rval);
      return typeIfPure;
    }

    let loc = !leftPure ? lloc : rloc;
    let error = new CompilerDiagnostic(unknownValueOfOrToString, loc, "PP0002", "RecoverableError");
    if (realm.handleError(error) === "Recover") {
      // Assume that an unknown value is actually a primitive or otherwise a well behaved object.
      return typeIfPure;
    }
    throw new FatalError();
  }
  if (op === "+") {
    let ltype = To.GetToPrimitivePureResultType(realm, lval);
    let rtype = To.GetToPrimitivePureResultType(realm, rval);

    function recoverWithValue() {
      // Assume that the unknown value is actually a primitive or otherwise a well behaved object.
      ltype = lval.getType();
      rtype = rval.getType();
      if (ltype === StringValue || rtype === StringValue) return StringValue;
      if (ltype === IntegralValue && rtype === IntegralValue) return IntegralValue;
      if ((ltype === NumberValue || ltype === IntegralValue) && (rtype === NumberValue || rtype === IntegralValue))
        return NumberValue;

      return Value;
    }

    if (realm.isInPureScope()) {
      if (!ltype) Leak.leakValue(realm, lval);
      if (!rtype) Leak.leakValue(realm, rval);
      return recoverWithValue();
    }

    if (ltype === undefined || rtype === undefined) {
      let loc = ltype === undefined ? lloc : rloc;
      let error = new CompilerDiagnostic(unknownValueOfOrToString, loc, "PP0002", "RecoverableError");
      if (realm.handleError(error) === "Recover") {
        return recoverWithValue();
      }
      throw new FatalError();
    }
    if (ltype === StringValue || rtype === StringValue) return StringValue;
    return NumberValue;
  } else if (op === "<" || op === ">" || op === ">=" || op === "<=") {
    return leakOrReportErrorIfNotPure(To.IsToPrimitivePure.bind(To), BooleanValue);
  } else if (op === "!=" || op === "==") {
    let ltype = lval.getType();
    let rtype = rval.getType();
    if (ltype === NullValue || ltype === UndefinedValue || rtype === NullValue || rtype === UndefinedValue)
      return BooleanValue;
    return leakOrReportErrorIfNotPure(To.IsToPrimitivePure.bind(To), BooleanValue);
  } else if (op === "===" || op === "!==") {
    return BooleanValue;
  } else if (
    op === ">>>" ||
    op === "<<" ||
    op === ">>" ||
    op === "&" ||
    op === "|" ||
    op === "^" ||
    op === "**" ||
    op === "%" ||
    op === "/" ||
    op === "*" ||
    op === "-"
  ) {
    return leakOrReportErrorIfNotPure(To.IsToNumberPure.bind(To), NumberValue);
  } else if (op === "in" || op === "instanceof") {
    if (rval.mightNotBeObject()) {
      let error = new CompilerDiagnostic(
        `might not be an object, hence the ${op} operator might throw a TypeError`,
        rloc,
        "PP0003",
        "RecoverableError"
      );
      if (realm.handleError(error) === "Recover") {
        // Assume that the object is actually a well behaved object.
        return BooleanValue;
      }
      throw new FatalError();
    }
    if (!rval.mightNotBeObject()) {
      // Simple object won't throw here, aren't proxy objects or typed arrays and do not have @@hasInstance properties.
      if (rval.isSimpleObject()) return BooleanValue;
    }
    let error = new CompilerDiagnostic(
      `might be an object that behaves badly for the ${op} operator`,
      rloc,
      "PP0004",
      "RecoverableError"
    );
    if (realm.handleError(error) === "Recover") {
      // Assume that the object is actually a well behaved object.
      return BooleanValue;
    }
    throw new FatalError();
  }
  invariant(false, "unimplemented " + op);
}

export function computeBinary(
  realm: Realm,
  op: BabelBinaryOperator,
  lval: Value,
  rval: Value,
  lloc: ?BabelNodeSourceLocation,
  rloc: ?BabelNodeSourceLocation,
  loc?: ?BabelNodeSourceLocation
): Value {
  // partial evaluation shortcut for a particular pattern
  if (realm.useAbstractInterpretation && (op === "==" || op === "===" || op === "!=" || op === "!==")) {
    if (
      (!lval.mightNotBeObject() && (rval instanceof NullValue || rval instanceof UndefinedValue)) ||
      ((lval instanceof NullValue || lval instanceof UndefinedValue) && !rval.mightNotBeObject())
    ) {
      return new BooleanValue(realm, op[0] !== "=");
    }
  }

  if (lval instanceof AbstractValue || rval instanceof AbstractValue) {
    // generate error if binary operation might throw or have side effects
    if (realm.isInPureScope()) {
      realm.evaluateWithPossibleThrowCompletion(
        () => {
          getPureBinaryOperationResultType(realm, op, lval, rval, lloc, rloc);
          return realm.intrinsics.undefined;
        },
        TypesDomain.topVal,
        ValuesDomain.topVal
      );
    } else {
      getPureBinaryOperationResultType(realm, op, lval, rval, lloc, rloc);
    }
    return AbstractValue.createFromBinaryOp(realm, op, lval, rval, loc);
  }

  // ECMA262 12.10.3

  // 5. If Type(rval) is not Object, throw a TypeError exception.
  if (op === "in" && !(rval instanceof ObjectValue)) {
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
  }
  invariant(lval instanceof ConcreteValue);
  invariant(rval instanceof ConcreteValue);
  return ValuesDomain.computeBinary(realm, op, lval, rval);
}
