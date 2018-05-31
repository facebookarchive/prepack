/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { PropertyKeyValue } from "../types.js";
import type { ECMAScriptFunctionValue } from "../values/index.js";
import { LexicalEnvironment, Reference, EnvironmentRecord, GlobalEnvironmentRecord } from "../environment.js";
import { FatalError } from "../errors.js";
import { Realm, ExecutionContext } from "../realm.js";
import Value from "../values/Value.js";
import {
  FunctionValue,
  ECMAScriptSourceFunctionValue,
  ObjectValue,
  NullValue,
  UndefinedValue,
  NativeFunctionValue,
  AbstractObjectValue,
  AbstractValue,
} from "../values/index.js";
import { GetIterator, HasSomeCompatibleType, IsCallable, IsPropertyKey, IteratorStep, IteratorValue } from "./index.js";
import { GeneratorStart } from "../methods/generator.js";
import { ReturnCompletion, AbruptCompletion, ThrowCompletion, ForkedAbruptCompletion } from "../completions.js";
import { GetTemplateObject, GetV, GetThisValue } from "../methods/get.js";
import { Create, Environment, Functions, Join, Havoc, To, Widen } from "../singletons.js";
import invariant from "../invariant.js";
import type { BabelNodeExpression, BabelNodeSpreadElement, BabelNodeTemplateLiteral } from "babel-types";
import * as t from "babel-types";

// ECMA262 12.3.6.1
export function ArgumentListEvaluation(
  realm: Realm,
  strictCode: boolean,
  env: LexicalEnvironment,
  argNodes: Array<BabelNodeExpression | BabelNodeSpreadElement> | BabelNodeTemplateLiteral
): Array<Value> {
  if (Array.isArray(argNodes)) {
    let args = [];
    for (let node_ of argNodes) {
      if (node_.type === "SpreadElement") {
        let node = (node_: BabelNodeSpreadElement);
        // 1. Let list be a new empty List.
        let list = args;

        // 2. Let spreadRef be the result of evaluating AssignmentExpression.
        let spreadRef = env.evaluate(node.argument, strictCode);

        // 3. Let spreadObj be ? GetValue(spreadRef).
        let spreadObj = Environment.GetValue(realm, spreadRef);

        // 4. Let iterator be ? GetIterator(spreadObj).
        let iterator = GetIterator(realm, spreadObj);

        // 5. Repeat
        while (true) {
          // a. Let next be ? IteratorStep(iterator).
          let next = IteratorStep(realm, iterator);

          // b. If next is false, return list.
          if (!next) {
            break;
          }

          // c. Let nextArg be ? IteratorValue(next).
          let nextArg = IteratorValue(realm, next);

          // d. Append nextArg as the last element of list.
          list.push(nextArg);
        }
      } else {
        let ref = env.evaluate(node_, strictCode);
        let expr = Environment.GetValue(realm, ref);
        args.push(expr);
      }
    }
    return args;
  } else {
    let node = (argNodes: BabelNodeTemplateLiteral);
    if (node.expressions.length === 0) {
      // 1. Let templateLiteral be this TemplateLiteral.
      let templateLiteral = node;

      // 2. Let siteObj be GetTemplateObject(templateLiteral).
      let siteObj = GetTemplateObject(realm, templateLiteral);

      // 3. Return a List containing the one element which is siteObj.
      return [siteObj];
    } else {
      // 1. Let templateLiteral be this TemplateLiteral.
      let templateLiteral = node;

      // 2. Let siteObj be GetTemplateObject(templateLiteral).
      let siteObj = GetTemplateObject(realm, templateLiteral);

      // 3. Let firstSubRef be the result of evaluating Expression.
      let firstSubRef = env.evaluate(node.expressions[0], strictCode);

      // 4. Let firstSub be ? GetValue(firstSubRef).
      let firstSub = Environment.GetValue(realm, firstSubRef);

      // 5. Let restSub be SubstitutionEvaluation of TemplateSpans.
      let restSub = node.expressions.slice(1, node.expressions.length).map(expr => {
        return Environment.GetValue(realm, env.evaluate(expr, strictCode));
      });

      // 6. ReturnIfAbrupt(restSub).

      // 7. Assert: restSub is a List.
      invariant(restSub.constructor === Array, "restSub is a List");

      // 8. Return a List whose first element is siteObj, whose second elements is firstSub, and whose subsequent elements are the elements of restSub, in order. restSub may contain no elements.
      return [siteObj, firstSub, ...restSub];
    }
  }
}

// ECMA262 7.3.18
export function Invoke(realm: Realm, V: Value, P: PropertyKeyValue, argumentsList?: Array<Value>): Value {
  // 1. Assert: IsPropertyKey(P) is true.
  invariant(IsPropertyKey(realm, P), "expected property key");

  // 2. If argumentsList was not passed, let argumentsList be a new empty List.
  if (!argumentsList) argumentsList = [];

  // 3. Let func be ? GetV(V, P).
  let func = GetV(realm, V, P);

  // 4. Return ? Call(func, V, argumentsList).
  return Call(realm, func, V, argumentsList);
}

// ECMA262 12.3.4.2
export function EvaluateCall(
  realm: Realm,
  strictCode: boolean,
  env: LexicalEnvironment,
  ref: Reference | Value,
  args: Array<BabelNode> | BabelNodeTemplateLiteral
): Value {
  let thisValue;

  // 1. Let func be ? GetValue(ref).
  let func = Environment.GetValue(realm, ref);

  // 2. If Type(ref) is Reference, then
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
    // 3. Else Type(ref) is not Reference,
    // a. Let thisValue be undefined.
    thisValue = realm.intrinsics.undefined;
  }

  // 4. Return ? EvaluateDirectCall(func, thisValue, arguments, tailPosition).
  return EvaluateDirectCall(realm, strictCode, env, ref, func, thisValue, args);
}

// ECMA262 9.2.1.1
export function PrepareForOrdinaryCall(
  realm: Realm,
  F: ECMAScriptFunctionValue,
  newTarget?: ObjectValue
): ExecutionContext {
  // 1. Assert: Type(newTarget) is Undefined or Object.
  invariant(
    newTarget === undefined || newTarget instanceof ObjectValue,
    "expected undefined or object value for new target"
  );

  // 2. Let callerContext be the running execution context.
  let callerContext = realm.getRunningContext();

  // 3. Let calleeContext be a new ECMAScript code execution context.
  let calleeContext = realm.createExecutionContext();

  // 4. Set the Function of calleeContext to F.
  calleeContext.setFunction(F);
  calleeContext.setCaller(realm.getRunningContext());

  // 5. Let calleeRealm be the value of F's [[Realm]] internal slot.
  let calleeRealm = realm;

  // 6. Set the Realm of calleeContext to calleeRealm.
  calleeContext.realm = calleeRealm;

  // 7. Set the ScriptOrModule of calleeContext to the value of F's [[ScriptOrModule]] internal slot.
  calleeContext.ScriptOrModule = F.$ScriptOrModule;

  // 8. Let localEnv be NewFunctionEnvironment(F, newTarget).
  let localEnv = Environment.NewFunctionEnvironment(realm, F, newTarget);

  // 9. Set the LexicalEnvironment of calleeContext to localEnv.
  calleeContext.lexicalEnvironment = localEnv;

  // 10. Set the VariableEnvironment of calleeContext to localEnv.
  calleeContext.variableEnvironment = localEnv;

  // 11. If callerContext is not already suspended, suspend callerContext.
  callerContext.suspend();

  // 12. Push calleeContext onto the execution context stack; calleeContext is now the running execution context.
  realm.pushContext(calleeContext);

  // 13. NOTE Any exception objects produced after this point are associated with calleeRealm.

  // 14. Return calleeContext.
  return calleeContext;
}

// ECMA262 9.2.1.2
export function OrdinaryCallBindThis(
  realm: Realm,
  F: ECMAScriptFunctionValue,
  calleeContext: ExecutionContext,
  thisArgument: Value
): NullValue | ObjectValue | AbstractObjectValue | UndefinedValue {
  // 1. Let thisMode be the value of F's [[ThisMode]] internal slot.
  let thisMode = F.$ThisMode;

  // 2. If thisMode is lexical, return NormalCompletion(undefined).
  if (thisMode === "lexical") return realm.intrinsics.undefined;

  // 3. Let calleeRealm be the value of F's [[Realm]] internal slot.
  let calleeRealm = F.$Realm;

  // 4. Let localEnv be the LexicalEnvironment of calleeContext.
  let localEnv = calleeContext.lexicalEnvironment;

  let thisValue;
  // 5. If thisMode is strict, let thisValue be thisArgument.
  if (thisMode === "strict") {
    thisValue = (thisArgument: any);
  } else {
    // 6. Else,
    // a. If thisArgument is null or undefined, then
    if (HasSomeCompatibleType(thisArgument, NullValue, UndefinedValue)) {
      // i. Let globalEnv be calleeRealm.[[GlobalEnv]].
      let globalEnv = realm.$GlobalEnv;

      // ii. Let globalEnvRec be globalEnv's EnvironmentRecord.
      let globalEnvRec = globalEnv.environmentRecord;
      invariant(globalEnvRec instanceof GlobalEnvironmentRecord);

      // iii. Let thisValue be globalEnvRec.[[GlobalThisValue]].
      thisValue = globalEnvRec.$GlobalThisValue;
    } else {
      //  b. Else,
      // i. Let thisValue be ! ToObject(thisArgument).
      thisValue = To.ToObject(calleeRealm, thisArgument);

      // ii. NOTE ToObject produces wrapper objects using calleeRealm.
    }
  }

  // 7. Let envRec be localEnv's EnvironmentRecord.
  invariant(localEnv !== undefined);
  let envRec = localEnv.environmentRecord;

  // 8. Assert: The next step never returns an abrupt completion because envRec.[[ThisBindingStatus]] is not "initialized".

  // 9. Return envRec.BindThisValue(thisValue).
  return envRec.BindThisValue(thisValue);
}

// ECMA262 9.2.1.3
export function OrdinaryCallEvaluateBody(
  realm: Realm,
  f: ECMAScriptFunctionValue,
  argumentsList: Array<Value>
): Reference | Value | AbruptCompletion {
  if (f instanceof NativeFunctionValue) {
    let env = realm.getRunningContext().lexicalEnvironment;
    let context = env.environmentRecord.GetThisBinding();

    if (context instanceof AbstractObjectValue && context.kind === "conditional") {
      // TODO: we should handle this case and split the calls up
      // on the conditional, as it may yield better results
    }
    try {
      return f.callCallback(context, argumentsList, env.environmentRecord.$NewTarget);
    } catch (err) {
      if (err instanceof AbruptCompletion) {
        return err;
      } else if (err instanceof Error) {
        throw err;
      } else {
        throw new FatalError(err);
      }
    }
  } else {
    invariant(f instanceof ECMAScriptSourceFunctionValue);
    let F = f;
    if (F.$FunctionKind === "generator") {
      // 1. Perform ? FunctionDeclarationInstantiation(functionObject, argumentsList).
      Functions.FunctionDeclarationInstantiation(realm, F, argumentsList);

      // 2. Let G be ? OrdinaryCreateFromConstructor(functionObject, "%GeneratorPrototype%", « [[GeneratorState]], [[GeneratorContext]] »).
      let G = Create.OrdinaryCreateFromConstructor(realm, F, "GeneratorPrototype", {
        $GeneratorState: undefined,
        $GeneratorContext: undefined,
      });

      // 3. Perform GeneratorStart(G, FunctionBody).
      let code = F.$ECMAScriptCode;
      invariant(code !== undefined);
      GeneratorStart(realm, G, code);

      // 4. Return Completion{[[Type]]: return, [[Value]]: G, [[Target]]: empty}.
      return new ReturnCompletion(G, realm.currentLocation);
    } else {
      // TODO #1586: abstractRecursionSummarization is disabled for now, as it is likely too limiting
      // (as observed in large internal tests).
      const abstractRecursionSummarization = false;
      if (!realm.useAbstractInterpretation || realm.pathConditions.length === 0 || !abstractRecursionSummarization)
        return normalCall();
      let savedIsSelfRecursive = F.isSelfRecursive;
      try {
        F.isSelfRecursive = false;
        let effects = realm.evaluateForEffects(guardedCall, undefined, "OrdinaryCallEvaluateBody");
        if (F.isSelfRecursive) {
          AbstractValue.reportIntrospectionError(F, "call to function that calls itself");
          throw new FatalError();
          //todo: need to emit a specialized function that temporally captures the heap state at this point
        } else {
          realm.applyEffects(effects);
          let c = effects.result;
          return processResult(() => {
            invariant(c instanceof Value || c instanceof AbruptCompletion);
            return c;
          });
        }
      } finally {
        F.isSelfRecursive = savedIsSelfRecursive;
      }

      function guardedCall() {
        let currentLocation = realm.currentLocation;
        if (F.activeArguments !== undefined && F.activeArguments.has(currentLocation)) {
          let [previousPathLength, previousArguments] = F.activeArguments.get(currentLocation);
          if (realm.pathConditions.length > previousPathLength) {
            invariant(previousArguments !== undefined);
            // F is being called recursively while a call to it is still active
            F.isSelfRecursive = true;
            let widenedArgumentsList: Array<Value> = (Widen.widenValues(realm, previousArguments, argumentsList): any);
            if (Widen.containsArraysOfValue(realm, previousArguments, widenedArgumentsList)) {
              // Reached a fixed point. Executing this call will not add any knowledge
              // about the effects of the original call.
              return AbstractValue.createFromType(realm, Value, "widened return result");
            } else {
              argumentsList = widenedArgumentsList;
            }
          }
        }
        try {
          if (F.activeArguments === undefined) F.activeArguments = new Map();
          F.activeArguments.set(currentLocation, [realm.pathConditions.length, argumentsList]);
          return normalCall();
        } finally {
          F.activeArguments.delete(currentLocation);
        }
      }

      function normalCall() {
        // 1. Perform ? FunctionDeclarationInstantiation(F, argumentsList).
        Functions.FunctionDeclarationInstantiation(realm, F, argumentsList);

        // 2. Return the result of EvaluateBody of the parsed code that is the value of F's
        //    [[ECMAScriptCode]] internal slot passing F as the argument.
        let code = F.$ECMAScriptCode;
        invariant(code !== undefined);
        let context = realm.getRunningContext();
        return processResult(() => context.lexicalEnvironment.evaluateCompletionDeref(code, F.$Strict));
      }

      function processResult(getCompletion: () => AbruptCompletion | Value): AbruptCompletion | Value {
        let priorSavedCompletion = realm.savedCompletion;
        try {
          realm.savedCompletion = undefined;
          let c = getCompletion();

          // We are about the leave this function and this presents a join point where all non exeptional control flows
          // converge into a single flow using their joint effects to update the post join point state.
          if (!(c instanceof ReturnCompletion)) {
            if (!(c instanceof AbruptCompletion)) {
              c = new ReturnCompletion(realm.intrinsics.undefined, realm.currentLocation);
            }
          }
          invariant(c instanceof AbruptCompletion);

          // If there is a saved completion (i.e. unjoined abruptly completing control flows) then combine them with c
          let abruptCompletion = Functions.incorporateSavedCompletion(realm, c);
          invariant(abruptCompletion instanceof AbruptCompletion);

          // If there is single completion, we don't need to join
          if (!(abruptCompletion instanceof ForkedAbruptCompletion)) return abruptCompletion;

          // If none of the completions are return completions, there is no need to join either
          if (!abruptCompletion.containsCompletion(ReturnCompletion)) return abruptCompletion;

          // Apply the joined effects of return completions to the current state since these now join the normal path
          let joinedReturnEffects = Join.extractAndJoinCompletionsOfType(ReturnCompletion, realm, abruptCompletion);
          realm.applyEffects(joinedReturnEffects);
          c = joinedReturnEffects.result;
          invariant(c instanceof ReturnCompletion);

          // We now make a PossiblyNormalCompletion out of abruptCompletion.
          // extractAndJoinCompletionsOfType helped with this by cheating and turning all of its nested completions
          // that contain return completions into PossiblyNormalCompletions.
          let remainingCompletions = abruptCompletion.transferChildrenToPossiblyNormalCompletion();

          // If there are no throw completions left inside remainingCompletions, just return.
          if (!remainingCompletions.containsCompletion(ThrowCompletion)) return c;

          // Stash the remaining completions in the realm start tracking the effects that need to be appended
          // to the normal branch at the next join point.
          realm.savedCompletion = remainingCompletions;
          realm.captureEffects(remainingCompletions); // so that we can join the normal path with them later on
          return c;
        } finally {
          realm.incorporatePriorSavedCompletion(priorSavedCompletion);
        }
      }
    }
  }
}

// ECMA262 12.3.4.3
export function EvaluateDirectCall(
  realm: Realm,
  strictCode: boolean,
  env: LexicalEnvironment,
  ref: Value | Reference,
  func: Value,
  thisValue: Value,
  args: Array<BabelNodeExpression | BabelNodeSpreadElement> | BabelNodeTemplateLiteral,
  tailPosition?: boolean
): Value {
  // 1. Let argList be ? ArgumentListEvaluation(arguments).
  let argList = ArgumentListEvaluation(realm, strictCode, env, args);

  return EvaluateDirectCallWithArgList(realm, strictCode, env, ref, func, thisValue, argList, tailPosition);
}

export function EvaluateDirectCallWithArgList(
  realm: Realm,
  strictCode: boolean,
  env: LexicalEnvironment,
  ref: Value | Reference,
  func: Value,
  thisValue: Value,
  argList: Array<Value>,
  tailPosition?: boolean
): Value {
  if (func instanceof AbstractObjectValue && Value.isTypeCompatibleWith(func.getType(), FunctionValue)) {
    return AbstractValue.createTemporalFromBuildFunction(
      realm,
      func.functionResultType || Value,
      [func].concat(argList),
      (nodes: Array<BabelNodeExpression>) => {
        let fun_args = nodes.slice(1);
        return t.callExpression(nodes[0], ((fun_args: any): Array<BabelNodeExpression | BabelNodeSpreadElement>));
      }
    );
  }
  func = func.throwIfNotConcrete();

  // 2. If Type(func) is not Object, throw a TypeError exception.
  if (!(func instanceof ObjectValue)) {
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "not an object");
  }

  // 3. If IsCallable(func) is false, throw a TypeError exception.
  if (!IsCallable(realm, func)) {
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "not callable");
  }

  // 4. If tailPosition is true, perform PrepareForTailCall().
  if (tailPosition === true) PrepareForTailCall(realm);

  // 5. Let result be Call(func, thisValue, argList).
  let result = Call(realm, func, thisValue, argList);

  // 6. Assert: If tailPosition is true, the above call will not return here, but instead
  //    evaluation will continue as if the following return has already occurred.

  // 7. Assert: If result is not an abrupt completion, then Type(result) is an ECMAScript language type.
  invariant(result instanceof Value, "expected language value type");

  // 8. Return result.
  return result;
}

// ECMA262 14.6.3
export function PrepareForTailCall(realm: Realm) {
  // 1. Let leafContext be the running execution context.
  let leafContext = realm.getRunningContext();

  // 2. Suspend leafContext.
  leafContext.suspend();

  // 3. Pop leafContext from the execution context stack. The execution context now on the
  //    top of the stack becomes the running execution context.
  realm.onDestroyScope(leafContext.lexicalEnvironment);
  realm.popContext(leafContext);

  // TODO #1008 4. Assert: leafContext has no further use. It will never be activated as the running execution context.
}

// ECMA262 7.3.12
export function Call(realm: Realm, F: Value, V: Value, argsList?: Array<Value>): Value {
  // 1. If argumentsList was not passed, let argumentsList be a new empty List.
  argsList = argsList || [];

  // 2. If IsCallable(F) is false, throw a TypeError exception.
  if (IsCallable(realm, F) === false) {
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "not callable");
  }
  if (F instanceof AbstractValue && Value.isTypeCompatibleWith(F.getType(), FunctionValue)) {
    Havoc.value(realm, V);
    for (let arg of argsList) {
      Havoc.value(realm, arg);
    }
    if (V === realm.intrinsics.undefined) {
      let fullArgs = [F].concat(argsList);
      return AbstractValue.createTemporalFromBuildFunction(realm, Value, fullArgs, nodes => {
        let fun_args = ((nodes.slice(1): any): Array<BabelNodeExpression | BabelNodeSpreadElement>);
        return t.callExpression(nodes[0], fun_args);
      });
    } else {
      let fullArgs = [F, V].concat(argsList);
      return AbstractValue.createTemporalFromBuildFunction(realm, Value, fullArgs, nodes => {
        let fun_args = ((nodes.slice(1): any): Array<BabelNodeExpression | BabelNodeSpreadElement>);
        return t.callExpression(t.memberExpression(nodes[0], t.identifier("call")), fun_args);
      });
    }
  }
  invariant(F instanceof ObjectValue);

  // 3. Return ? F.[[Call]](V, argumentsList).
  invariant(F.$Call, "no call method on this value");
  return F.$Call(V, argsList);
}
