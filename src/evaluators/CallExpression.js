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
import { AbruptCompletion, PossiblyNormalCompletion } from "../completions.js";
import type { Realm } from "../realm.js";
import { Effects } from "../realm.js";
import type { LexicalEnvironment } from "../environment.js";
import { EnvironmentRecord } from "../environment.js";
import { TypesDomain, ValuesDomain } from "../domains/index.js";
import { Value } from "../values/index.js";
import { AbstractValue, AbstractObjectValue, BooleanValue, ConcreteValue, FunctionValue } from "../values/index.js";
import { Reference } from "../environment.js";
import { Environment, Functions, Havoc, Join } from "../singletons.js";
import {
  ArgumentListEvaluation,
  EvaluateDirectCall,
  GetThisValue,
  IsInTailPosition,
  SameValue,
} from "../methods/index.js";
import type { BabelNodeCallExpression, BabelNodeExpression, BabelNodeSpreadElement } from "babel-types";
import invariant from "../invariant.js";
import * as t from "babel-types";
import SuperCall from "./SuperCall";

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
  realm.setNextExecutionContextLocation(ast.loc);

  // 1. Let ref be the result of evaluating MemberExpression.
  let ref = env.evaluate(ast.callee, strictCode);
  if (
    ref instanceof Reference &&
    ref.base instanceof AbstractValue &&
    ref.base.mightNotBeObject() &&
    realm.isInPureScope()
  ) {
    let dummy = ref.base;
    // avoid explicitly converting ref.base to an object because that will create a generator entry
    // leading to two object allocations rather than one.
    return realm.evaluateWithPossibleThrowCompletion(
      () => generateRuntimeCall(ref, dummy, ast, strictCode, env, realm),
      TypesDomain.topVal,
      ValuesDomain.topVal
    );
  }

  // 2. Let func be ? GetValue(ref).
  let func = Environment.GetValue(realm, ref);

  return EvaluateCall(ref, func, ast, strictCode, env, realm);
}

function callBothFunctionsAndJoinTheirEffects(
  args: Array<Value>,
  ast: BabelNodeCallExpression,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): Value {
  let [cond, func1, func2] = args;
  invariant(cond instanceof AbstractValue && cond.getType() === BooleanValue);
  invariant(Value.isTypeCompatibleWith(func1.getType(), FunctionValue));
  invariant(Value.isTypeCompatibleWith(func2.getType(), FunctionValue));

  const e1 = realm.evaluateForEffects(
    () => EvaluateCall(func1, func1, ast, strictCode, env, realm),
    undefined,
    "callBothFunctionsAndJoinTheirEffects/1"
  );

  const e2 = realm.evaluateForEffects(
    () => EvaluateCall(func2, func2, ast, strictCode, env, realm),
    undefined,
    "callBothFunctionsAndJoinTheirEffects/2"
  );

  let joinedEffects = Join.joinForkOrChoose(
    realm,
    cond,
    new Effects(e1.result, e1.generator, e1.modifiedBindings, e1.modifiedProperties, e1.createdObjects),
    new Effects(e2.result, e2.generator, e2.modifiedBindings, e2.modifiedProperties, e2.createdObjects)
  );
  let completion = joinedEffects.result;
  if (completion instanceof PossiblyNormalCompletion) {
    // in this case one of the branches may complete abruptly, which means that
    // not all control flow branches join into one flow at this point.
    // Consequently we have to continue tracking changes until the point where
    // all the branches come together into one.
    completion = realm.composeWithSavedCompletion(completion);
  }

  // Note that the effects of (non joining) abrupt branches are not included
  // in joinedEffects, but are tracked separately inside completion.
  realm.applyEffects(joinedEffects);

  // return or throw completion
  if (completion instanceof AbruptCompletion) throw completion;
  invariant(completion instanceof Value);
  return completion;
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
      // passed as an argument has leaked to the environment and is henceforth in an unknown (havoced) state,
      // as is any other object that is known to be reachable from this object.
      // NB: Note that this is still optimistic, particularly if the environment exposes the same object
      // to Prepack via alternative means, thus creating aliasing that is not tracked by Prepack.
      Havoc.value(realm, arg, ast.loc);
    }
  }
  let resultType = (func instanceof AbstractObjectValue ? func.functionResultType : undefined) || Value;
  return AbstractValue.createTemporalFromBuildFunction(realm, resultType, args, nodes => {
    let callFunc;
    let argStart = 1;
    if (thisArg instanceof Value) {
      if (typeof propName === "string") {
        callFunc = t.isValidIdentifier(propName)
          ? t.memberExpression(nodes[0], t.identifier(propName), false)
          : t.memberExpression(nodes[0], t.stringLiteral(propName), true);
      } else {
        callFunc = t.memberExpression(nodes[0], nodes[1], true);
        argStart = 2;
      }
    } else {
      callFunc = nodes[0];
    }
    let fun_args = ((nodes.slice(argStart): any): Array<BabelNodeExpression | BabelNodeSpreadElement>);
    return t.callExpression(callFunc, fun_args);
  });
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
  let effects;
  let savedSuppressDiagnostics = realm.suppressDiagnostics;
  try {
    realm.suppressDiagnostics = true;
    effects = realm.evaluateForEffects(
      () => EvaluateDirectCall(realm, strictCode, env, ref, func, thisValue, ast.arguments, tailCall),
      undefined,
      "tryToEvaluateCallOrLeaveAsAbstract"
    );
  } catch (error) {
    if (error instanceof FatalError) {
      realm.suppressDiagnostics = savedSuppressDiagnostics;
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
    if (!Value.isTypeCompatibleWith(func.getType(), FunctionValue)) {
      if (!realm.isInPureScope()) {
        // If this is not a function, this call might throw which can change the state of the program.
        // If this is called from a pure function we handle it using evaluateWithPossiblyAbruptCompletion.
        let error = new CompilerDiagnostic("might not be a function", loc, "PP0005", "RecoverableError");
        if (realm.handleError(error) === "Fail") throw new FatalError();
      }
    } else if (func.kind === "conditional") {
      return callBothFunctionsAndJoinTheirEffects(func.args, ast, strictCode, env, realm);
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
  if (realm.isInPureScope()) {
    return tryToEvaluateCallOrLeaveAsAbstract(ref, func, ast, strictCode, env, realm, thisValue, tailCall);
  } else {
    return EvaluateDirectCall(realm, strictCode, env, ref, func, thisValue, ast.arguments, tailCall);
  }
}
