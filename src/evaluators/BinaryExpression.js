/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import type { Realm } from "../realm.js";
import { TypesDomain, ValuesDomain } from "../domains/index.js";
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
import { AbruptCompletion, PossiblyNormalCompletion } from "../completions.js";
import { Environment, Havoc, To } from "../singletons.js";
import type {
  BabelBinaryOperator,
  BabelNodeBinaryExpression,
  BabelNodeExpression,
  BabelNodeSourceLocation,
} from "babel-types";
import * as t from "babel-types";
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
  function reportErrorIfNotPure(purityTest: (Realm, Value) => boolean, typeIfPure: typeof Value): typeof Value {
    let leftPure = purityTest(realm, lval);
    let rightPure = purityTest(realm, rval);
    if (leftPure && rightPure) return typeIfPure;
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
    if (ltype === undefined || rtype === undefined) {
      let loc = ltype === undefined ? lloc : rloc;
      let error = new CompilerDiagnostic(unknownValueOfOrToString, loc, "PP0002", "RecoverableError");
      if (realm.handleError(error) === "Recover") {
        // Assume that the unknown value is actually a primitive or otherwise a well behaved object.
        ltype = lval.getType();
        rtype = rval.getType();
        if (ltype === StringValue || rtype === StringValue) return StringValue;
        if (ltype === IntegralValue && rtype === IntegralValue) return IntegralValue;
        if ((ltype === NumberValue || ltype === IntegralValue) && (rtype === NumberValue || rtype === IntegralValue))
          return NumberValue;

        return Value;
      }
      throw new FatalError();
    }
    if (ltype === StringValue || rtype === StringValue) return StringValue;
    return NumberValue;
  } else if (op === "<" || op === ">" || op === ">=" || op === "<=") {
    return reportErrorIfNotPure(To.IsToPrimitivePure.bind(To), BooleanValue);
  } else if (op === "!=" || op === "==") {
    let ltype = lval.getType();
    let rtype = rval.getType();
    if (ltype === NullValue || ltype === UndefinedValue || rtype === NullValue || rtype === UndefinedValue)
      return BooleanValue;
    return reportErrorIfNotPure(To.IsToPrimitivePure.bind(To), BooleanValue);
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
    return reportErrorIfNotPure(To.IsToNumberPure.bind(To), NumberValue);
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

  let resultType;
  const compute = () => {
    if (lval instanceof AbstractValue || rval instanceof AbstractValue) {
      // generate error if binary operation might throw or have side effects
      resultType = getPureBinaryOperationResultType(realm, op, lval, rval, lloc, rloc);
      return AbstractValue.createFromBinaryOp(realm, op, lval, rval, loc);
    } else {
      // ECMA262 12.10.3

      // 5. If Type(rval) is not Object, throw a TypeError exception.
      if (op === "in" && !(rval instanceof ObjectValue)) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
      }
      invariant(lval instanceof ConcreteValue);
      invariant(rval instanceof ConcreteValue);
      const result = ValuesDomain.computeBinary(realm, op, lval, rval);
      resultType = result.getType();
      return result;
    }
  };

  if (realm.isInPureScope()) {
    // If we're in pure mode we can recover even if this operation might not be pure.
    // To do that, we'll temporarily override the error handler.
    const previousErrorHandler = realm.errorHandler;
    let isPure = true;
    realm.errorHandler = diagnostic => {
      isPure = false;
      return "Recover";
    };
    let effects;
    try {
      effects = realm.evaluateForEffects(compute, undefined, "computeBinary");
    } catch (x) {
      if (x instanceof FatalError) {
        isPure = false;
      } else {
        throw x;
      }
    } finally {
      realm.errorHandler = previousErrorHandler;
    }

    if (isPure && effects) {
      // Note that the effects of (non joining) abrupt branches are not included
      // in effects, but are tracked separately inside completion.
      realm.applyEffects(effects);
      let completion = effects.result;
      if (completion instanceof PossiblyNormalCompletion) {
        // in this case one of the branches may complete abruptly, which means that
        // not all control flow branches join into one flow at this point.
        // Consequently we have to continue tracking changes until the point where
        // all the branches come together into one.
        completion = realm.composeWithSavedCompletion(completion);
      }
      // return or throw completion
      if (completion instanceof AbruptCompletion) throw completion;
      invariant(completion instanceof Value);
      return completion;
    }

    // If this ended up reporting an error, it might not be pure, so we'll leave it in
    // as a temporal operation with a known return type.
    // Some of these values may trigger side-effectful user code such as valueOf.
    // To be safe, we have to Havoc them.
    Havoc.value(realm, lval, loc);
    if (op !== "in") {
      // The "in" operator have side-effects on its right val other than throw.
      Havoc.value(realm, rval, loc);
    }
    return realm.evaluateWithPossibleThrowCompletion(
      () =>
        AbstractValue.createTemporalFromBuildFunction(
          realm,
          resultType,
          [lval, rval],
          ([lnode, rnode]: Array<BabelNodeExpression>) => t.binaryExpression(op, lnode, rnode)
        ),
      TypesDomain.topVal,
      ValuesDomain.topVal
    );
  }
  return compute();
}
