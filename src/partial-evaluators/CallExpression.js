/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { BabelNodeCallExpression, BabelNodeExpression, BabelNodeStatement } from "babel-types";
import type { Realm } from "../realm.js";
import type { LexicalEnvironment } from "../environment.js";

import { AbruptCompletion, Completion, PossiblyNormalCompletion } from "../completions.js";
import { EnvironmentRecord, Reference } from "../environment.js";
import {
  composeNormalCompletions,
  EvaluateDirectCallWithArgList,
  GetBase,
  GetReferencedName,
  GetThisValue,
  GetValue,
  IsInTailPosition,
  IsPropertyReference,
  joinEffects,
  PerformEval,
  SameValue,
  stopEffectCaptureJoinApplyAndReturnCompletion,
  unbundleNormalCompletion,
} from "../methods/index.js";
import { AbstractValue, BooleanValue, FunctionValue, Value } from "../values/index.js";

import * as t from "babel-types";
import invariant from "../invariant.js";

// ECMA262 12.3.4.1
export default function(
  ast: BabelNodeCallExpression,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): [Completion | Value, BabelNodeExpression, Array<BabelNodeStatement>] {
  realm.setNextExecutionContextLocation(ast.loc);

  // 1. Let ref be the result of evaluating MemberExpression.
  let [ref, calleeAst, calleeIO] = env.partiallyEvaluateCompletion(ast.callee, strictCode);
  if (ref instanceof AbruptCompletion) return [ref, (calleeAst: any), calleeIO];
  let completion;
  if (ref instanceof PossiblyNormalCompletion) {
    completion = ref;
    ref = completion.value;
  }
  invariant(ref instanceof Value || ref instanceof Reference);

  // 2. Let func be ? GetValue(ref).
  let func = GetValue(realm, ref);

  let io = calleeIO;
  let partialArgs = [];
  let argVals = [];
  for (let arg of ast.arguments) {
    let [argValue, argAst, argIO] = env.partiallyEvaluateCompletionDeref(arg, strictCode);
    io = io.concat(argIO);
    partialArgs.push((argAst: any));
    if (argValue instanceof AbruptCompletion) {
      if (completion instanceof PossiblyNormalCompletion)
        completion = stopEffectCaptureJoinApplyAndReturnCompletion(completion, argValue, realm);
      else completion = argValue;
      let resultAst = t.callExpression((calleeAst: any), partialArgs);
      return [completion, resultAst, io];
    }
    if (argValue instanceof PossiblyNormalCompletion) {
      argVals.push(argValue.value);
      if (completion instanceof PossiblyNormalCompletion)
        completion = composeNormalCompletions(completion, argValue, argValue.value, realm);
      else completion = argValue;
    } else {
      invariant(argValue instanceof Value);
      argVals.push(argValue);
    }
  }

  let callResult = EvaluateCall(ref, func, ast, argVals, strictCode, env, realm);
  if (callResult instanceof AbruptCompletion) {
    if (completion instanceof PossiblyNormalCompletion)
      completion = stopEffectCaptureJoinApplyAndReturnCompletion(completion, callResult, realm);
    else completion = callResult;
    let resultAst = t.callExpression((calleeAst: any), partialArgs);
    return [completion, resultAst, io];
  }
  let callCompletion;
  [callCompletion, callResult] = unbundleNormalCompletion(callResult);
  invariant(callResult instanceof Value);
  invariant(completion === undefined || completion instanceof PossiblyNormalCompletion);
  completion = composeNormalCompletions(completion, callCompletion, callResult, realm);
  if (completion instanceof PossiblyNormalCompletion) {
    realm.captureEffects(completion);
  }
  return [completion, t.callExpression((calleeAst: any), partialArgs), io];
}

function callBothFunctionsAndJoinTheirEffects(
  funcs: Array<Value>,
  ast: BabelNodeCallExpression,
  argVals: Array<Value>,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): AbruptCompletion | Value {
  let [cond, func1, func2] = funcs;
  invariant(cond instanceof AbstractValue && cond.getType() === BooleanValue);
  invariant(Value.isTypeCompatibleWith(func1.getType(), FunctionValue));
  invariant(Value.isTypeCompatibleWith(func2.getType(), FunctionValue));

  let [compl1, gen1, bindings1, properties1, createdObj1] = realm.evaluateForEffects(() =>
    EvaluateCall(func1, func1, ast, argVals, strictCode, env, realm)
  );

  let [compl2, gen2, bindings2, properties2, createdObj2] = realm.evaluateForEffects(() =>
    EvaluateCall(func2, func2, ast, argVals, strictCode, env, realm)
  );

  let joinedEffects = joinEffects(
    realm,
    cond,
    [compl1, gen1, bindings1, properties1, createdObj1],
    [compl2, gen2, bindings2, properties2, createdObj2]
  );
  let joinedCompletion = joinedEffects[0];
  if (joinedCompletion instanceof PossiblyNormalCompletion) {
    // in this case one of the branches may complete abruptly, which means that
    // not all control flow branches join into one flow at this point.
    // Consequently we have to continue tracking changes until the point where
    // all the branches come together into one.
    joinedCompletion = realm.composeWithSavedCompletion(joinedCompletion);
  }

  // Note that the effects of (non joining) abrupt branches are not included
  // in joinedEffects, but are tracked separately inside joinedCompletion.
  realm.applyEffects(joinedEffects);

  // return or throw completion
  invariant(joinedCompletion instanceof AbruptCompletion || joinedCompletion instanceof Value);
  return joinedCompletion;
}

function EvaluateCall(
  ref: Value | Reference,
  func: Value,
  ast: BabelNodeCallExpression,
  argList: Array<Value>,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): AbruptCompletion | Value {
  if (func instanceof AbstractValue && Value.isTypeCompatibleWith(func.getType(), FunctionValue)) {
    if (func.kind === "conditional")
      return callBothFunctionsAndJoinTheirEffects(func.args, ast, argList, strictCode, env, realm);

    // The called function comes from the environmental model and we require that
    // such functions have no visible side-effects. Hence we can carry on
    // by returning a call node with the arguments updated with their partial counterparts.
    // TODO: obtain the type of the return value from the abstract function.
    return AbstractValue.createFromType(realm, Value);
  }
  // If func is abstract and not known to be a safe function, we can't safely continue.
  func = func.throwIfNotConcrete();

  // 3. If Type(ref) is Reference and IsPropertyReference(ref) is false and GetReferencedName(ref) is "eval", then
  if (ref instanceof Reference && !IsPropertyReference(realm, ref) && GetReferencedName(realm, ref) === "eval") {
    // a. If SameValue(func, %eval%) is true, then
    if (SameValue(realm, func, realm.intrinsics.eval)) {
      // i. Let argList be ? ArgumentListEvaluation(Arguments).

      // ii. If argList has no elements, return undefined.
      if (argList.length === 0) return realm.intrinsics.undefined;

      // iii. Let evalText be the first element of argList.
      let evalText = argList[0];

      // iv. If the source code matching this CallExpression is strict code, let strictCaller be true. Otherwise let strictCaller be false.
      let strictCaller = strictCode;

      // v. Let evalRealm be the current Realm Record.
      let evalRealm = realm;

      // vi. Return ? PerformEval(evalText, evalRealm, strictCaller, true).
      return PerformEval(realm, evalText, evalRealm, strictCaller, true);
    }
  }

  let thisValue;

  // 4. If Type(ref) is Reference, then
  if (ref instanceof Reference) {
    // a. If IsPropertyReference(ref) is true, then
    if (IsPropertyReference(realm, ref)) {
      // i. Let thisValue be GetThisValue(ref).
      thisValue = GetThisValue(realm, ref);
    } else {
      // b. Else, the base of ref is an Environment Record
      // i. Let refEnv be GetBase(ref).
      let refEnv = GetBase(realm, ref);
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

  try {
    return EvaluateDirectCallWithArgList(realm, strictCode, env, ref, func, thisValue, argList, tailCall);
  } catch (err) {
    if (err instanceof Completion) return err;
    throw err;
  }
}
