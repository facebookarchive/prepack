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
import {
  FunctionDeclarationInstantiation,
  GetBase,
  GetIterator,
  GetValue,
  HasSomeCompatibleType,
  incorporateSavedCompletion,
  IsCallable,
  IsPropertyKey,
  IsPropertyReference,
  IteratorStep,
  IteratorValue,
  joinEffectsAndPromoteNestedReturnCompletions,
  NewFunctionEnvironment,
  ToObjectPartial,
  unbundleReturnCompletion,
} from "./index.js";
import { GeneratorStart } from "../methods/generator.js";
import { OrdinaryCreateFromConstructor } from "../methods/create.js";
import {
  ReturnCompletion,
  AbruptCompletion,
  JoinedAbruptCompletions,
  PossiblyNormalCompletion,
} from "../completions.js";
import { GetTemplateObject, GetV, GetThisValue } from "../methods/get.js";
import { construct_empty_effects } from "../realm.js";
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
        let spreadObj = GetValue(realm, spreadRef);

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
        let expr = GetValue(realm, ref);
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
      let firstSub = GetValue(realm, firstSubRef);

      // 5. Let restSub be SubstitutionEvaluation of TemplateSpans.
      let restSub = node.expressions.slice(1, node.expressions.length).map(expr => {
        return GetValue(realm, env.evaluate(expr, strictCode));
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
  let func = GetValue(realm, ref);

  // 2. If Type(ref) is Reference, then
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
  let localEnv = NewFunctionEnvironment(realm, F, newTarget);

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
      thisValue = ToObjectPartial(calleeRealm, thisArgument);

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
  F: ECMAScriptFunctionValue,
  argumentsList: Array<Value>
): Reference | Value | AbruptCompletion {
  if (F instanceof NativeFunctionValue) {
    let env = realm.getRunningContext().lexicalEnvironment;
    try {
      return F.callCallback(env.environmentRecord.GetThisBinding(), argumentsList, env.environmentRecord.$NewTarget);
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
    invariant(F instanceof ECMAScriptSourceFunctionValue);
    if (F.$FunctionKind === "generator") {
      // 1. Perform ? FunctionDeclarationInstantiation(functionObject, argumentsList).
      FunctionDeclarationInstantiation(realm, F, argumentsList);

      // 2. Let G be ? OrdinaryCreateFromConstructor(functionObject, "%GeneratorPrototype%", « [[GeneratorState]], [[GeneratorContext]] »).
      let G = OrdinaryCreateFromConstructor(realm, F, "GeneratorPrototype", {
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
      // 1. Perform ? FunctionDeclarationInstantiation(F, argumentsList).
      FunctionDeclarationInstantiation(realm, F, argumentsList);

      // 2. Return the result of EvaluateBody of the parsed code that is the value of F's
      //    [[ECMAScriptCode]] internal slot passing F as the argument.
      let code = F.$ECMAScriptCode;
      invariant(code !== undefined);
      let context = realm.getRunningContext();
      let c = context.lexicalEnvironment.evaluateCompletionDeref(code, F.$Strict);
      // We are about the leave this function and this presents a join point where all non exeptional control flows
      // converge into a single flow using the joined effects as the new state.
      c = incorporateSavedCompletion(realm, c);
      let joinedEffects;
      if (c instanceof PossiblyNormalCompletion) {
        let e = realm.getCapturedEffects(c);
        if (e !== undefined) {
          // There were earlier, conditional exits from the function
          // We join together the current effects with the effects of any earlier returns that are tracked in c.
          realm.stopEffectCaptureAndUndoEffects(c);
        } else {
          e = construct_empty_effects(realm);
        }
        joinedEffects = joinEffectsAndPromoteNestedReturnCompletions(realm, c, e);
      } else if (c instanceof JoinedAbruptCompletions) {
        joinedEffects = joinEffectsAndPromoteNestedReturnCompletions(realm, c, construct_empty_effects(realm));
      }
      if (joinedEffects !== undefined) {
        let result = joinedEffects[0];
        if (result instanceof ReturnCompletion) {
          realm.applyEffects(joinedEffects);
          return result;
        }
        invariant(result instanceof JoinedAbruptCompletions);
        if (!(result.consequent instanceof ReturnCompletion || result.alternate instanceof ReturnCompletion)) {
          realm.applyEffects(joinedEffects);
          throw result;
        }
        // There is a normal return exit, but also one or more throw completions.
        // The throw completions must be extracted into a saved possibly normal completion
        // so that the caller can pick them up in its next completion.
        joinedEffects = extractAndSavePossiblyNormalCompletion(result);
        result = joinedEffects[0];
        invariant(result instanceof ReturnCompletion);
        realm.applyEffects(joinedEffects);
        return result;
      } else {
        invariant(c instanceof Value || c instanceof AbruptCompletion);
        return c;
      }
    }
  }

  function extractAndSavePossiblyNormalCompletion(c: JoinedAbruptCompletions) {
    // There are throw completions that conditionally escape from the the call.
    // We need to carry on in normal mode (after arranging to capturing effects)
    // while stashing away the throw completions so that the next completion we return
    // incorporates them.
    let [joinedEffects, possiblyNormalCompletion] = unbundleReturnCompletion(realm, c);
    realm.composeWithSavedCompletion(possiblyNormalCompletion);
    return joinedEffects;
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
  if (func instanceof AbstractValue && Value.isTypeCompatibleWith(func.getType(), FunctionValue)) {
    return AbstractValue.createTemporalFromBuildFunction(
      realm,
      Value,
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
    let fullArgs = [F].concat(argsList);
    return AbstractValue.createTemporalFromBuildFunction(realm, Value, fullArgs, nodes => {
      let fun_args = ((nodes.slice(1): any): Array<BabelNodeExpression | BabelNodeSpreadElement>);
      return t.callExpression(nodes[0], fun_args);
    });
  }
  invariant(F instanceof ObjectValue);

  // 3. Return ? F.[[Call]](V, argumentsList).
  invariant(F.$Call, "no call method on this value");
  return F.$Call(V, argsList);
}
