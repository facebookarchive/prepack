/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { CompilerDiagnostic, FatalError } from "../errors.js";
import type { Realm } from "../realm.js";
import { type LexicalEnvironment, type BaseValue, isValidBaseValue } from "../environment.js";
import { EnvironmentRecord } from "../environment.js";
import { TypesDomain, ValuesDomain } from "../domains/index.js";
import {
  AbstractValue,
  AbstractObjectValue,
  BooleanValue,
  ConcreteValue,
  FunctionValue,
  IntegralValue,
  NativeFunctionValue,
  NumberValue,
  ObjectValue,
  StringValue,
  SymbolValue,
  Value,
} from "../values/index.js";
import { Reference } from "../environment.js";
import { Environment, Functions, Leak } from "../singletons.js";
import {
  ArgumentListEvaluation,
  EvaluateDirectCall,
  GetThisValue,
  IsInTailPosition,
  SameValue,
} from "../methods/index.js";
import type { BabelNodeCallExpression } from "@babel/types";
import invariant from "../invariant.js";
import SuperCall from "./SuperCall.js";
import { createOperationDescriptor } from "../utils/generator.js";

export default function(
  ast: BabelNodeCallExpression,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): Value {
  if (ast.callee.type === "Super") {
    return SuperCall(ast.arguments, strictCode, env, realm);
  }

  // ECMA262 12.3.4.1

  // 1. Let ref be the result of evaluating MemberExpression.
  let ref = env.evaluate(ast.callee, strictCode);

  let previousLoc = realm.setNextExecutionContextLocation(ast.loc);
  try {
    return evaluateReference(ref, ast, strictCode, env, realm);
  } finally {
    realm.setNextExecutionContextLocation(previousLoc);
  }
}

function getPrimitivePrototypeFromType(realm: Realm, value: AbstractValue): void | ObjectValue {
  switch (value.getType()) {
    case IntegralValue:
    case NumberValue:
      return realm.intrinsics.NumberPrototype;
    case StringValue:
      return realm.intrinsics.StringPrototype;
    case BooleanValue:
      return realm.intrinsics.BooleanPrototype;
    case SymbolValue:
      return realm.intrinsics.SymbolPrototype;
    default:
      return undefined;
  }
}

function evaluateReference(
  ref: Reference | Value,
  ast: BabelNodeCallExpression,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): Value {
  if (
    ref instanceof Reference &&
    ref.base instanceof AbstractValue &&
    // TODO: what about ref.base conditionals that mightBeObjects?
    ref.base.mightNotBeObject() &&
    realm.isInPureScope()
  ) {
    let base = ref.base;
    if (base.kind === "conditional") {
      let [condValue, consequentVal, alternateVal] = base.args;
      invariant(condValue instanceof AbstractValue);
      return evaluateConditionalReferenceBase(ref, condValue, consequentVal, alternateVal, ast, strictCode, env, realm);
    } else if (base.kind === "||") {
      let [leftValue, rightValue] = base.args;
      invariant(leftValue instanceof AbstractValue);
      return evaluateConditionalReferenceBase(ref, leftValue, leftValue, rightValue, ast, strictCode, env, realm);
    } else if (base.kind === "&&") {
      let [leftValue, rightValue] = base.args;
      invariant(leftValue instanceof AbstractValue);
      return evaluateConditionalReferenceBase(ref, leftValue, rightValue, leftValue, ast, strictCode, env, realm);
    }
    let referencedName = ref.referencedName;

    // When dealing with a PrimitiveValue, like StringValue, NumberValue, IntegralValue etc
    // if we are referencing a prototype method, then it's safe to access, even
    // on an abstract value as the value is immutable and can't have a property
    // that matches the prototype method (unless the prototype was modified).
    // We assume the global prototype of built-ins has not been altered since
    // global code has finished. See #1233 for more context in regards to unmodified
    // global prototypes.
    let prototypeIfPrimitive = getPrimitivePrototypeFromType(realm, base);
    if (prototypeIfPrimitive !== undefined && typeof referencedName === "string") {
      let possibleMethodValue = prototypeIfPrimitive._SafeGetDataPropertyValue(referencedName);

      if (possibleMethodValue instanceof FunctionValue) {
        return EvaluateCall(ref, possibleMethodValue, ast, strictCode, env, realm);
      }
    }
    // avoid explicitly converting ref.base to an object because that will create a generator entry
    // leading to two object allocations rather than one.
    return realm.evaluateWithPossibleThrowCompletion(
      () => generateRuntimeCall(ref, base, ast, strictCode, env, realm),
      TypesDomain.topVal,
      ValuesDomain.topVal
    );
  }
  // 2. Let func be ? GetValue(ref).
  let func = Environment.GetValue(realm, ref);

  return EvaluateCall(ref, func, ast, strictCode, env, realm);
}

function evaluateConditionalReferenceBase(
  ref: Reference,
  condValue: AbstractValue,
  consequentVal: Value,
  alternateVal: Value,
  ast: BabelNodeCallExpression,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): Value {
  return realm.evaluateWithAbstractConditional(
    condValue,
    () => {
      return realm.evaluateForEffects(
        () => {
          if (isValidBaseValue(consequentVal)) {
            let consequentRef = new Reference(
              ((consequentVal: any): BaseValue),
              ref.referencedName,
              ref.strict,
              ref.thisValue
            );
            return evaluateReference(consequentRef, ast, strictCode, env, realm);
          }
          return consequentVal;
        },
        null,
        "evaluateConditionalReferenceBase consequent"
      );
    },
    () => {
      return realm.evaluateForEffects(
        () => {
          if (isValidBaseValue(alternateVal)) {
            let alternateRef = new Reference(
              ((alternateVal: any): BaseValue),
              ref.referencedName,
              ref.strict,
              ref.thisValue
            );
            return evaluateReference(alternateRef, ast, strictCode, env, realm);
          }
          return alternateVal;
        },
        null,
        "evaluateConditionalReferenceBase alternate"
      );
    }
  );
}

function callBothFunctionsAndJoinTheirEffects(
  condValue: AbstractValue,
  consequentVal: Value,
  alternateVal: Value,
  ast: BabelNodeCallExpression,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): Value {
  return realm.evaluateWithAbstractConditional(
    condValue,
    () => {
      return realm.evaluateForEffects(
        () => EvaluateCall(consequentVal, consequentVal, ast, strictCode, env, realm),
        null,
        "callBothFunctionsAndJoinTheirEffects consequent"
      );
    },
    () => {
      return realm.evaluateForEffects(
        () => EvaluateCall(alternateVal, alternateVal, ast, strictCode, env, realm),
        null,
        "callBothFunctionsAndJoinTheirEffects alternate"
      );
    }
  );
}

function generateRuntimeCall(
  ref: Value | Reference,
  func: Value,
  ast: BabelNodeCallExpression,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
) {
  let args = [func];
  let [thisArg, propName] = ref instanceof Reference ? [ref.base, ref.referencedName] : [];
  if (thisArg instanceof Value) args = [thisArg];
  if (propName !== undefined && typeof propName !== "string") args.push(propName);
  args = args.concat(ArgumentListEvaluation(realm, strictCode, env, ast.arguments));
  for (let arg of args) {
    if (arg !== func) {
      // Since we don't know which function we are calling, we assume that any unfrozen object
      // passed as an argument has leaked to the environment as is any other object that is known to be reachable from this object.
      // NB: Note that this is still optimistic, particularly if the environment exposes the same object
      // to Prepack via alternative means, thus creating aliasing that is not tracked by Prepack.
      Leak.value(realm, arg, ast.loc);
    }
  }
  let resultType = (func instanceof AbstractObjectValue ? func.functionResultType : undefined) || Value;
  return AbstractValue.createTemporalFromBuildFunction(
    realm,
    resultType,
    args,
    createOperationDescriptor("CALL_BAILOUT", { propRef: propName, thisArg })
  );
}

function tryToEvaluateCallOrLeaveAsAbstract(
  ref: Value | Reference,
  func: Value,
  ast: BabelNodeCallExpression,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm,
  thisValue: Value,
  tailCall: boolean
): Value {
  invariant(!realm.instantRender.enabled);
  let effects;
  let savedSuppressDiagnostics = realm.suppressDiagnostics;
  try {
    realm.suppressDiagnostics = !(func instanceof NativeFunctionValue) || func.name !== "__optimize";
    effects = realm.evaluateForEffects(
      () => EvaluateDirectCall(realm, strictCode, env, ref, func, thisValue, ast.arguments, tailCall),
      undefined,
      "tryToEvaluateCallOrLeaveAsAbstract"
    );
  } catch (error) {
    if (error instanceof FatalError) {
      if (func instanceof NativeFunctionValue && func.name === "__fatal") throw error;
      realm.suppressDiagnostics = savedSuppressDiagnostics;
      Leak.value(realm, func, ast.loc);
      return realm.evaluateWithPossibleThrowCompletion(
        () => generateRuntimeCall(ref, func, ast, strictCode, env, realm),
        TypesDomain.topVal,
        ValuesDomain.topVal
      );
    } else {
      throw error;
    }
  } finally {
    realm.suppressDiagnostics = savedSuppressDiagnostics;
  }
  realm.applyEffects(effects);
  return realm.returnOrThrowCompletion(effects.result);
}

function EvaluateCall(
  ref: Value | Reference,
  func: Value,
  ast: BabelNodeCallExpression,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): Value {
  if (func instanceof AbstractValue) {
    let loc = ast.callee.type === "MemberExpression" ? ast.callee.property.loc : ast.callee.loc;
    if (func.kind === "conditional") {
      let [condValue, consequentVal, alternateVal] = func.args;
      invariant(condValue instanceof AbstractValue);
      // If neither values are functions than do not try and call both functions with a conditional
      if (
        Value.isTypeCompatibleWith(consequentVal.getType(), FunctionValue) ||
        Value.isTypeCompatibleWith(alternateVal.getType(), FunctionValue)
      ) {
        return callBothFunctionsAndJoinTheirEffects(
          condValue,
          consequentVal,
          alternateVal,
          ast,
          strictCode,
          env,
          realm
        );
      }
    } else if (func.kind === "||") {
      let [leftValue, rightValue] = func.args;
      invariant(leftValue instanceof AbstractValue);
      // If neither values are functions than do not try and call both functions with a conditional
      if (
        Value.isTypeCompatibleWith(leftValue.getType(), FunctionValue) ||
        Value.isTypeCompatibleWith(rightValue.getType(), FunctionValue)
      ) {
        return callBothFunctionsAndJoinTheirEffects(leftValue, leftValue, rightValue, ast, strictCode, env, realm);
      }
    } else if (func.kind === "&&") {
      let [leftValue, rightValue] = func.args;
      invariant(leftValue instanceof AbstractValue);
      // If neither values are functions than do not try and call both functions with a conditional
      if (
        Value.isTypeCompatibleWith(leftValue.getType(), FunctionValue) ||
        Value.isTypeCompatibleWith(rightValue.getType(), FunctionValue)
      ) {
        return callBothFunctionsAndJoinTheirEffects(leftValue, rightValue, leftValue, ast, strictCode, env, realm);
      }
    }
    if (!Value.isTypeCompatibleWith(func.getType(), FunctionValue)) {
      if (!realm.isInPureScope()) {
        // If this is not a function, this call might throw which can change the state of the program.
        // If this is called from a pure function we handle it using evaluateWithPossiblyAbruptCompletion.
        let error = new CompilerDiagnostic("might not be a function", loc, "PP0005", "RecoverableError");
        if (realm.handleError(error) === "Fail") throw new FatalError();
      }
    } else {
      // Assume that it is a safe function. TODO #705: really?
    }
    if (realm.isInPureScope()) {
      // In pure functions we allow abstract functions to throw, which this might.
      return realm.evaluateWithPossibleThrowCompletion(
        () => generateRuntimeCall(ref, func, ast, strictCode, env, realm),
        TypesDomain.topVal,
        ValuesDomain.topVal
      );
    }
    return generateRuntimeCall(ref, func, ast, strictCode, env, realm);
  }
  invariant(func instanceof ConcreteValue);

  // 3. If Type(ref) is Reference and IsPropertyReference(ref) is false and GetReferencedName(ref) is "eval", then
  if (
    ref instanceof Reference &&
    !Environment.IsPropertyReference(realm, ref) &&
    Environment.GetReferencedName(realm, ref) === "eval"
  ) {
    // a. If SameValue(func, %eval%) is true, then
    if (SameValue(realm, func, realm.intrinsics.eval)) {
      // i. Let argList be ? ArgumentListEvaluation(Arguments).
      let argList = ArgumentListEvaluation(realm, strictCode, env, ast.arguments);
      // ii. If argList has no elements, return undefined.
      if (argList.length === 0) return realm.intrinsics.undefined;
      // iii. Let evalText be the first element of argList.
      let evalText = argList[0];
      // iv. If the source code matching this CallExpression is strict code, let strictCaller be true. Otherwise let strictCaller be false.
      let strictCaller = strictCode;
      // v. Let evalRealm be the current Realm Record.
      let evalRealm = realm;
      // vi. Return ? PerformEval(evalText, evalRealm, strictCaller, true).
      if (evalText instanceof AbstractValue) {
        let loc = ast.arguments[0].loc;
        let error = new CompilerDiagnostic("eval argument must be a known value", loc, "PP0006", "RecoverableError");
        if (realm.handleError(error) === "Fail") throw new FatalError();
        // Assume that it is a safe eval with no visible heap changes or abrupt control flow.
        return generateRuntimeCall(ref, func, ast, strictCode, env, realm);
      }
      return Functions.PerformEval(realm, evalText, evalRealm, strictCaller, true);
    }
  }

  let thisValue;

  // 4. If Type(ref) is Reference, then
  if (ref instanceof Reference) {
    // a. If IsPropertyReference(ref) is true, then
    if (Environment.IsPropertyReference(realm, ref)) {
      // i. Let thisValue be GetThisValue(ref).
      thisValue = GetThisValue(realm, ref);
    } else {
      // b. Else, the base of ref is an Environment Record
      // i. Let refEnv be GetBase(ref).
      let refEnv = Environment.GetBase(realm, ref);
      invariant(refEnv instanceof EnvironmentRecord);

      // ii. Let thisValue be refEnv.WithBaseObject().
      thisValue = refEnv.WithBaseObject();
    }
  } else {
    // 5. Else Type(ref) is not Reference,
    // a. Let thisValue be undefined.
    thisValue = realm.intrinsics.undefined;
  }

  // 6. Let thisCall be this CallExpression.
  let thisCall = ast;

  // 7. Let tailCall be IsInTailPosition(thisCall). (See 14.6.1)
  let tailCall = IsInTailPosition(realm, thisCall);

  // 8. Return ? EvaluateDirectCall(func, thisValue, Arguments, tailCall).
  if (realm.isInPureScope() && !realm.instantRender.enabled) {
    return tryToEvaluateCallOrLeaveAsAbstract(ref, func, ast, strictCode, env, realm, thisValue, tailCall);
  } else {
    return EvaluateDirectCall(realm, strictCode, env, ref, func, thisValue, ast.arguments, tailCall);
  }
}
