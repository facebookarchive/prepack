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
import {
  EnvironmentRecord,
  GlobalEnvironmentRecord,
  LexicalEnvironment,
  mightBecomeAnObject,
  Reference,
} from "../environment.js";
import { FatalError } from "../errors.js";
import { Realm, ExecutionContext } from "../realm.js";
import Value from "../values/Value.js";
import {
  AbstractObjectValue,
  AbstractValue,
  ECMAScriptSourceFunctionValue,
  FunctionValue,
  NativeFunctionValue,
  NullValue,
  ObjectValue,
  UndefinedValue,
} from "../values/index.js";
import { GetIterator, HasSomeCompatibleType, IsCallable, IsPropertyKey, IteratorStep, IteratorValue } from "./index.js";
import { GeneratorStart } from "./generator.js";
import {
  AbruptCompletion,
  Completion,
  JoinedAbruptCompletions,
  JoinedNormalAndAbruptCompletions,
  NormalCompletion,
  ReturnCompletion,
  ThrowCompletion,
} from "../completions.js";
import { GetTemplateObject, GetV, GetThisValue } from "./get.js";
import { Create, Environment, Functions, Leak, Join, To, Widen } from "../singletons.js";
import invariant from "../invariant.js";
import { createOperationDescriptor } from "../utils/generator.js";
import type { BabelNodeExpression, BabelNodeSpreadElement, BabelNodeTemplateLiteral } from "@babel/types";

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
  try {
    realm.pushContext(calleeContext);
  } catch (error) {
    // `realm.pushContext` may throw if we have exceeded the maximum stack size.
    realm.onDestroyScope(localEnv);
    throw error;
  }

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

function callNativeFunctionValue(
  realm: Realm,
  f: NativeFunctionValue,
  argumentsList: Array<Value>
): void | AbruptCompletion {
  let env = realm.getRunningContext().lexicalEnvironment;
  let context = env.environmentRecord.GetThisBinding();

  // we have an inConditional flag, as we do not want to return
  const functionCall = (contextVal, inConditional) => {
    try {
      invariant(
        contextVal instanceof AbstractObjectValue ||
          contextVal instanceof ObjectValue ||
          contextVal instanceof NullValue ||
          contextVal instanceof UndefinedValue ||
          mightBecomeAnObject(contextVal)
      );
      let completion = f.callCallback(
        // TODO: this is not right. Either fix the type signature of callCallback or wrap contextVal in a coercion
        ((contextVal: any): AbstractObjectValue | ObjectValue | NullValue | UndefinedValue),
        argumentsList,
        env.environmentRecord.$NewTarget
      );
      return inConditional ? completion.value : completion;
    } catch (err) {
      if (err instanceof AbruptCompletion) {
        return inConditional ? err.value : err;
      } else if (err instanceof Error) {
        throw err;
      } else {
        throw new FatalError(err);
      }
    }
  };

  const wrapInReturnCompletion = contextVal => new ReturnCompletion(contextVal, realm.currentLocation);

  if (context instanceof AbstractObjectValue && context.kind === "conditional") {
    let [condValue, consequentVal, alternateVal] = context.args;
    invariant(condValue instanceof AbstractValue);

    return wrapInReturnCompletion(
      realm.evaluateWithAbstractConditional(
        condValue,
        () => {
          return realm.evaluateForEffects(
            () => functionCall(consequentVal, true),
            null,
            "callNativeFunctionValue consequent"
          );
        },
        () => {
          return realm.evaluateForEffects(
            () => functionCall(alternateVal, true),
            null,
            "callNativeFunctionValue alternate"
          );
        }
      )
    );
  }
  let c = functionCall(context, false);
  if (c instanceof AbruptCompletion) return c;
  return undefined;
}

// ECMA262 9.2.1.3
export function OrdinaryCallEvaluateBody(
  realm: Realm,
  f: ECMAScriptFunctionValue,
  argumentsList: Array<Value>
): void | AbruptCompletion {
  if (f instanceof NativeFunctionValue) {
    return callNativeFunctionValue(realm, f, argumentsList);
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
      if (!realm.useAbstractInterpretation || realm.pathConditions.isEmpty() || !abstractRecursionSummarization)
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
            if (c instanceof AbruptCompletion || c instanceof JoinedNormalAndAbruptCompletions) return c;
            return undefined;
          });
        }
      } finally {
        F.isSelfRecursive = savedIsSelfRecursive;
      }

      function guardedCall(): Value | Completion {
        let currentLocation = realm.currentLocation;
        if (F.activeArguments !== undefined && F.activeArguments.has(currentLocation)) {
          let [previousPathLength, previousArguments] = F.activeArguments.get(currentLocation);
          if (realm.pathConditions.getLength() > previousPathLength) {
            invariant(previousArguments !== undefined);
            // F is being called recursively while a call to it is still active
            F.isSelfRecursive = true;
            let widenedArgumentsList: Array<Value> = (Widen.widenValues(realm, previousArguments, argumentsList): any);
            if (Widen.containsArraysOfValue(realm, previousArguments, widenedArgumentsList)) {
              // Reached a fixed point. Executing this call will not add any knowledge
              // about the effects of the original call.
              return realm.intrinsics.undefined;
            } else {
              argumentsList = widenedArgumentsList;
            }
          }
        }
        try {
          if (F.activeArguments === undefined) F.activeArguments = new Map();
          F.activeArguments.set(currentLocation, [realm.pathConditions.getLength(), argumentsList]);
          return normalCall() || realm.intrinsics.undefined;
        } finally {
          F.activeArguments.delete(currentLocation);
        }
      }

      function normalCall(): void | AbruptCompletion {
        // 1. Perform ? FunctionDeclarationInstantiation(F, argumentsList).
        Functions.FunctionDeclarationInstantiation(realm, F, argumentsList);

        // 2. Return the result of EvaluateBody of the parsed code that is the value of F's
        //    [[ECMAScriptCode]] internal slot passing F as the argument.
        let code = F.$ECMAScriptCode;
        invariant(code !== undefined);
        let context = realm.getRunningContext();
        return processResult(() => {
          let c = context.lexicalEnvironment.evaluateCompletionDeref(code, F.$Strict);
          if (c instanceof AbruptCompletion || c instanceof JoinedNormalAndAbruptCompletions) return c;
          return undefined;
        });
      }

      function processResult(
        getCompletion: () => void | AbruptCompletion | JoinedNormalAndAbruptCompletions
      ): void | AbruptCompletion {
        // We don't want the callee to see abrupt completions from the caller.
        let priorSavedCompletion = realm.savedCompletion;
        realm.savedCompletion = undefined;

        let c;
        try {
          c = getCompletion();
        } catch (e) {
          invariant(!(e instanceof AbruptCompletion));
          throw e;
        }
        c = Functions.incorporateSavedCompletion(realm, c); // in case the callee had conditional abrupt completions
        realm.savedCompletion = priorSavedCompletion;
        if (c === undefined) return undefined; // the callee had no returns or throws
        if (c instanceof ThrowCompletion || c instanceof ReturnCompletion) return c;
        // Non mixed completions will not be joined completions, but single completions with joined values.
        // At this point it must be true that
        // c contains return completions and possibly also normal completions (which are implicitly "return undefined;")
        // and c also contains throw completions. Hence we assert:
        invariant(c instanceof JoinedAbruptCompletions || c instanceof JoinedNormalAndAbruptCompletions);

        // We want to add only the throw completions to priorSavedCompletion (but must keep their conditions in tact).
        // The (joined) return completions must be returned to our caller
        let rc = c;
        Completion.makeAllNormalCompletionsResultInUndefined(c);
        c = Completion.normalizeSelectedCompletions(r => r instanceof ReturnCompletion, c);
        invariant(c.containsSelectedCompletion(r => r instanceof NormalCompletion));
        let rv = Join.joinValuesOfSelectedCompletions(r => r instanceof NormalCompletion, c);
        if (c.containsSelectedCompletion(r => r instanceof ThrowCompletion)) {
          realm.composeWithSavedCompletion(c);
          if (rv instanceof AbstractValue) {
            rv = realm.simplifyAndRefineAbstractValue(rv);
          }
        }
        rc = new ReturnCompletion(rv);
        return rc;
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
      createOperationDescriptor("DIRECT_CALL_WITH_ARG_LIST")
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
export function PrepareForTailCall(realm: Realm): void {
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
    Leak.value(realm, V);
    for (let arg of argsList) {
      Leak.value(realm, arg);
    }
    if (V === realm.intrinsics.undefined) {
      let fullArgs = [F].concat(argsList);
      return AbstractValue.createTemporalFromBuildFunction(
        realm,
        Value,
        fullArgs,
        createOperationDescriptor("CALL_ABSTRACT_FUNC")
      );
    } else {
      let fullArgs = [F, V].concat(argsList);
      return AbstractValue.createTemporalFromBuildFunction(
        realm,
        Value,
        fullArgs,
        createOperationDescriptor("CALL_ABSTRACT_FUNC_THIS")
      );
    }
  }
  invariant(F instanceof ObjectValue);

  // 3. Return ? F.[[Call]](V, argumentsList).
  invariant(F.$Call, "no call method on this value");
  return F.$Call(V, argsList);
}
