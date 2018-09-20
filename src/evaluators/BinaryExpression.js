/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import { SimpleNormalCompletion } from "../completions.js";
import type { Realm } from "../realm.js";
import { TypesDomain, ValuesDomain } from "../domains/index.js";
import type { LexicalEnvironment } from "../environment.js";
import { CompilerDiagnostic, FatalError } from "../errors.js";
import {
  AbstractObjectValue,
  AbstractValue,
  BooleanValue,
  ConcreteValue,
  NullValue,
  NumberValue,
  IntegralValue,
  ObjectValue,
  PrimitiveValue,
  StringValue,
  SymbolValue,
  UndefinedValue,
  Value,
} from "../values/index.js";
import { Environment, Leak, To } from "../singletons.js";
import type { BabelBinaryOperator, BabelNodeBinaryExpression, BabelNodeSourceLocation } from "@babel/types";
import { createOperationDescriptor } from "../utils/generator.js";
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
    if (ltype === StringValue || rtype === StringValue) {
      // If either type is a string, the other one will be called with ToString, so that has to be pure.
      if (!To.IsToStringPure(realm, rval)) {
        rtype = undefined;
      }
      if (!To.IsToStringPure(realm, lval)) {
        ltype = undefined;
      }
    } else {
      // Otherwise, they will be called with ToNumber, so that has to be pure.
      if (!To.IsToNumberPure(realm, rval)) {
        rtype = undefined;
      }
      if (!To.IsToNumberPure(realm, lval)) {
        ltype = undefined;
      }
    }
    if (ltype === undefined || rtype === undefined) {
      if (lval.getType() === SymbolValue || rval.getType() === SymbolValue) {
        // Symbols never implicitly coerce to primitives.
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
      }
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
    if (lval.getType() === SymbolValue || rval.getType() === SymbolValue) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }
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
    let lvalIsAbstract = lval instanceof AbstractValue;
    let rvalIsAbstract = rval instanceof AbstractValue;
    if (lvalIsAbstract || rvalIsAbstract) {
      // If the left-hand side of an instanceof operation is a primitive,
      // and the right-hand side is a simple object (it does not have [Symbol.hasInstance]),
      // then the result should always compute to `false`.
      if (
        op === "instanceof" &&
        Value.isTypeCompatibleWith(lval.getType(), PrimitiveValue) &&
        rval instanceof AbstractObjectValue &&
        rval.isSimpleObject()
      ) {
        return realm.intrinsics.false;
      }

      try {
        // generate error if binary operation might throw or have side effects
        resultType = getPureBinaryOperationResultType(realm, op, lval, rval, lloc, rloc);
        let result = AbstractValue.createFromBinaryOp(realm, op, lval, rval, loc);

        if ((op === "in" || op === "instanceof") && result instanceof AbstractValue && rvalIsAbstract)
          // This operation is a conditional atemporal
          // See #2327
          result = AbstractValue.convertToTemporalIfArgsAreTemporal(
            realm,
            result,
            [rval] /* throwing does not depend upon lval */
          );
        return result;
      } catch (x) {
        if (x instanceof FatalError) {
          // There is no need to revert any effects, because the above operation is pure.
          // If this failed and one of the arguments was conditional, try each value
          // and join the effects based on the condition.
          if (lval instanceof AbstractValue && lval.kind === "conditional") {
            let [condition, consequentL, alternateL] = lval.args;
            invariant(condition instanceof AbstractValue);
            return realm.evaluateWithAbstractConditional(
              condition,
              () =>
                realm.evaluateForEffects(
                  () => computeBinary(realm, op, consequentL, rval, lloc, rloc, loc),
                  undefined,
                  "ConditionalBinaryExpression/1"
                ),
              () =>
                realm.evaluateForEffects(
                  () => computeBinary(realm, op, alternateL, rval, lloc, rloc, loc),
                  undefined,
                  "ConditionalBinaryExpression/2"
                )
            );
          }
          if (rval instanceof AbstractValue && rval.kind === "conditional") {
            let [condition, consequentR, alternateR] = rval.args;
            invariant(condition instanceof AbstractValue);
            return realm.evaluateWithAbstractConditional(
              condition,
              () =>
                realm.evaluateForEffects(
                  () => computeBinary(realm, op, lval, consequentR, lloc, rloc, loc),
                  undefined,
                  "ConditionalBinaryExpression/3"
                ),
              () =>
                realm.evaluateForEffects(
                  () => computeBinary(realm, op, lval, alternateR, lloc, rloc, loc),
                  undefined,
                  "ConditionalBinaryExpression/4"
                )
            );
          }
        }
        throw x;
      }
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
      realm.applyEffects(effects);
      if (effects.result instanceof SimpleNormalCompletion) return effects.result.value;
    }

    // If this ended up reporting an error, it might not be pure, so we'll leave it in
    // as a temporal operation with a known return type.
    // Some of these values may trigger side-effectful user code such as valueOf.
    // To be safe, we have to leak them.
    Leak.value(realm, lval, loc);
    if (op !== "in") {
      // The "in" operator have side-effects on its right val other than throw.
      Leak.value(realm, rval, loc);
    }
    return realm.evaluateWithPossibleThrowCompletion(
      () =>
        AbstractValue.createTemporalFromBuildFunction(
          realm,
          resultType,
          [lval, rval],
          createOperationDescriptor("BINARY_EXPRESSION", { binaryOperator: op }),
          { isPure: true }
        ),
      TypesDomain.topVal,
      ValuesDomain.topVal
    );
  }
  return compute();
}
