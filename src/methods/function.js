/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { LexicalEnvironment } from "../environment.js";
import type { PropertyKeyValue, FunctionBodyAstNode } from "../types.js";
import { FatalError } from "../errors.js";
import type { Realm } from "../realm.js";
import type { ECMAScriptFunctionValue } from "../values/index.js";
import { Completion, ReturnCompletion, AbruptCompletion, NormalCompletion } from "../completions.js";
import { ExecutionContext } from "../realm.js";
import { GlobalEnvironmentRecord, ObjectEnvironmentRecord } from "../environment.js";
import {
  AbstractValue,
  AbstractObjectValue,
  BoundFunctionValue,
  ECMAScriptSourceFunctionValue,
  EmptyValue,
  FunctionValue,
  NumberValue,
  ObjectValue,
  StringValue,
  SymbolValue,
  UndefinedValue,
  Value,
} from "../values/index.js";
import { OrdinaryCallEvaluateBody, OrdinaryCallBindThis, PrepareForOrdinaryCall, Call } from "./call.js";
import { SameValue } from "../methods/abstract.js";
import { Construct } from "../methods/construct.js";
import { UpdateEmpty } from "../methods/index.js";
import { CreateListIterator } from "../methods/iterator.js";
import { EvalPropertyName } from "../evaluators/ObjectExpression.js";
import { Create, Environment, Join, Properties } from "../singletons.js";
import traverseFast from "../utils/traverse-fast.js";
import invariant from "../invariant.js";
import parse from "../utils/parse.js";
import IsStrict from "../utils/strict.js";
import * as t from "babel-types";
import type {
  BabelNode,
  BabelNodeBlockStatement,
  BabelNodeClassMethod,
  BabelNodeDoWhileStatement,
  BabelNodeForInStatement,
  BabelNodeForOfStatement,
  BabelNodeForStatement,
  BabelNodeIfStatement,
  BabelNodeLabeledStatement,
  BabelNodeLVal,
  BabelNodeObjectMethod,
  BabelNodeProgram,
  BabelNodeStatement,
  BabelNodeSwitchStatement,
  BabelNodeTryStatement,
  BabelNodeVariableDeclaration,
  BabelNodeWhileStatement,
  BabelNodeWithStatement,
} from "babel-types";

function InternalCall(
  realm: Realm,
  F: ECMAScriptFunctionValue,
  thisArgument: Value,
  argsList: Array<Value>,
  tracerIndex: number
): Value {
  // 1. Assert: F is an ECMAScript function object.
  invariant(F instanceof FunctionValue, "expected function value");

  // Tracing: Give all registered tracers a chance to detour, wrapping around each other if needed.
  while (tracerIndex < realm.tracers.length) {
    let tracer = realm.tracers[tracerIndex];
    let nextIndex = ++tracerIndex;
    let detourResult = tracer.detourCall(F, thisArgument, argsList, undefined, () =>
      InternalCall(realm, F, thisArgument, argsList, nextIndex)
    );
    if (detourResult instanceof Value) return detourResult;
  }

  // 2. If F's [[FunctionKind]] internal slot is "classConstructor", throw a TypeError exception.
  if (F.$FunctionKind === "classConstructor")
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "not callable");

  // 3. Let callerContext be the running execution context.
  let callerContext = realm.getRunningContext();

  // 4. Let calleeContext be PrepareForOrdinaryCall(F, undefined).
  let calleeContext = PrepareForOrdinaryCall(realm, F, undefined);
  let calleeEnv = calleeContext.lexicalEnvironment;

  let result;
  try {
    for (let t1 of realm.tracers) t1.beforeCall(F, thisArgument, argsList, undefined);

    // 5. Assert: calleeContext is now the running execution context.
    invariant(realm.getRunningContext() === calleeContext, "calleeContext should be current execution context");

    // 6. Perform OrdinaryCallBindThis(F, calleeContext, thisArgument).
    OrdinaryCallBindThis(realm, F, calleeContext, thisArgument);

    // 7. Let result be OrdinaryCallEvaluateBody(F, argumentsList).
    result = OrdinaryCallEvaluateBody(realm, F, argsList);
  } finally {
    // 8. Remove calleeContext from the execution context stack and restore callerContext as the running execution context.
    realm.popContext(calleeContext);
    realm.onDestroyScope(calleeContext.lexicalEnvironment);
    if (calleeContext.lexicalEnvironment !== calleeEnv) realm.onDestroyScope(calleeEnv);
    invariant(realm.getRunningContext() === callerContext);

    for (let t2 of realm.tracers) t2.afterCall(F, thisArgument, argsList, undefined, (result: any));
  }

  // 9. If result.[[Type]] is return, return NormalCompletion(result.[[Value]]).
  if (result instanceof ReturnCompletion) {
    return result.value;
  }

  // 10. ReturnIfAbrupt(result).  or if possibly abrupt
  if (result instanceof Completion) {
    throw result;
  }

  // 11. Return NormalCompletion(undefined).
  return realm.intrinsics.undefined;
}

// ECMA262 9.4.1.1
function $BoundCall(realm: Realm, F: BoundFunctionValue, thisArgument: Value, argumentsList: Array<Value>): Value {
  // 1. Let target be the value of F's [[BoundTargetFunction]] internal slot.
  let target = F.$BoundTargetFunction;

  // 2. Let boundThis be the value of F's [[BoundThis]] internal slot.
  let boundThis = F.$BoundThis;

  // 3. Let boundArgs be the value of F's [[BoundArguments]] internal slot.
  let boundArgs = F.$BoundArguments;

  // 4. Let args be a new list containing the same values as the list boundArgs in the same order followed
  //    by the same values as the list argumentsList in the same order.
  let args = boundArgs.concat(argumentsList);

  // 5. Return ? Call(target, boundThis, args).
  return Call(realm, target, boundThis, args);
}

// ECMA262 9.4.1.2
function $BoundConstruct(
  realm: Realm,
  F: BoundFunctionValue,
  argumentsList: Array<Value>,
  newTarget: ObjectValue
): ObjectValue {
  // 1. Let target be the value of F's [[BoundTargetFunction]] internal slot.
  let target = F.$BoundTargetFunction;

  // 2. Assert: target has a [[Construct]] internal method.
  invariant(target.$Construct !== undefined, "doesn't have a construct internal method");

  // 3. Let boundArgs be the value of F's [[BoundArguments]] internal slot.
  let boundArgs = F.$BoundArguments;

  // 4. Let args be a new list containing the same values as the list boundArgs in the same order followed
  //    by the same values as the list argumentsList in the same order.
  let args = boundArgs.concat(argumentsList);

  // 5. If SameValue(F, newTarget) is true, let newTarget be target.
  if (SameValue(realm, F, newTarget)) newTarget = target;

  // 6. Return ? Construct(target, args, newTarget).
  return Construct(realm, target, args, newTarget);
}

function InternalConstruct(
  realm: Realm,
  F: ECMAScriptFunctionValue,
  argumentsList: Array<Value>,
  newTarget: ObjectValue,
  thisArgument: void | ObjectValue,
  tracerIndex: number
): ObjectValue {
  // 1. Assert: F is an ECMAScript function object.
  invariant(F instanceof FunctionValue, "expected function");

  // 2. Assert: Type(newTarget) is Object.
  invariant(newTarget instanceof ObjectValue, "expected object");

  if (!realm.hasRunningContext()) {
    invariant(realm.useAbstractInterpretation);
    throw new FatalError("no running context");
  }

  // 3. Let callerContext be the running execution context.
  let callerContext = realm.getRunningContext();

  // 4. Let kind be F's [[ConstructorKind]] internal slot.
  let kind = F.$ConstructorKind;

  // 5. If kind is "base", then
  if (thisArgument === undefined && kind === "base") {
    // a. Let thisArgument be ? OrdinaryCreateFromConstructor(newTarget, "%ObjectPrototype%").
    thisArgument = Create.OrdinaryCreateFromConstructor(realm, newTarget, "ObjectPrototype");
  }

  // Tracing: Give all registered tracers a chance to detour, wrapping around each other if needed.
  while (tracerIndex < realm.tracers.length) {
    let tracer = realm.tracers[tracerIndex];
    let nextIndex = ++tracerIndex;
    let detourResult = tracer.detourCall(F, thisArgument, argumentsList, newTarget, () =>
      InternalConstruct(realm, F, argumentsList, newTarget, thisArgument, nextIndex)
    );
    if (detourResult instanceof ObjectValue) return detourResult;
    invariant(detourResult === undefined);
  }

  // 6. Let calleeContext be PrepareForOrdinaryCall(F, newTarget).
  let calleeContext = PrepareForOrdinaryCall(realm, F, newTarget);
  let calleeEnv = calleeContext.lexicalEnvironment;

  // 7. Assert: calleeContext is now the running execution context.
  invariant(realm.getRunningContext() === calleeContext, "expected calleeContext to be running context");

  let result, envRec;
  try {
    for (let t1 of realm.tracers) t1.beforeCall(F, thisArgument, argumentsList, newTarget);

    // 8. If kind is "base", perform OrdinaryCallBindThis(F, calleeContext, thisArgument).
    if (kind === "base") {
      invariant(thisArgument, "this wasn't initialized for some reason");
      OrdinaryCallBindThis(realm, F, calleeContext, thisArgument);
    }

    // 9. Let constructorEnv be the LexicalEnvironment of calleeContext.
    let constructorEnv = calleeContext.lexicalEnvironment;

    // 10. Let envRec be constructorEnv's EnvironmentRecord.
    envRec = constructorEnv.environmentRecord;

    // 11. Let result be OrdinaryCallEvaluateBody(F, argumentsList).
    result = OrdinaryCallEvaluateBody(realm, F, argumentsList);
  } finally {
    // 12. Remove calleeContext from the execution context stack and restore callerContext as the running execution context.
    realm.popContext(calleeContext);
    realm.onDestroyScope(calleeContext.lexicalEnvironment);
    if (calleeContext.lexicalEnvironment !== calleeEnv) realm.onDestroyScope(calleeEnv);
    invariant(realm.getRunningContext() === callerContext);

    for (let t2 of realm.tracers) t2.afterCall(F, thisArgument, argumentsList, newTarget, result);
  }

  // 13. If result.[[Type]] is return, then
  if (result instanceof ReturnCompletion) {
    // a. If Type(result.[[Value]]) is Object, return NormalCompletion(result.[[Value]]).
    if (result.value.mightBeObject()) {
      return result.value.throwIfNotConcreteObject();
    }

    // b. If kind is "base", return NormalCompletion(thisArgument).
    if (kind === "base") {
      invariant(thisArgument, "this wasn't initialized for some reason");
      return thisArgument;
    }

    // c. If result.[[Value]] is not undefined, throw a TypeError exception.
    if (!result.value.mightBeUndefined())
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "constructor must return Object");
    result.value.throwIfNotConcrete();
  } else if (result instanceof AbruptCompletion) {
    // 14. Else, ReturnIfAbrupt(result).
    throw result;
  }

  // 15. Return ? envRec.GetThisBinding().
  let envRecThisBinding = envRec.GetThisBinding();
  invariant(envRecThisBinding instanceof ObjectValue);
  return envRecThisBinding;
}

export class FunctionImplementation {
  FindVarScopedDeclarations(ast_node: BabelNode): Array<BabelNode> {
    function FindVarScopedDeclarationsFor(ast: BabelNode, level: number) {
      let statements = [];
      switch (ast.type) {
        case "Program":
          statements = ((ast: any): BabelNodeProgram).body;
          break;
        case "BlockStatement":
          statements = ((ast: any): BabelNodeBlockStatement).body;
          break;
        case "DoWhileStatement":
          statements = [((ast: any): BabelNodeDoWhileStatement).body];
          break;
        case "WhileStatement":
          statements = [((ast: any): BabelNodeWhileStatement).body];
          break;
        case "IfStatement":
          let astIfStatement: BabelNodeIfStatement = (ast: any);
          statements = [astIfStatement.consequent, astIfStatement.alternate];
          break;
        case "ForStatement":
          let astForStatement: BabelNodeForStatement = (ast: any);
          statements = [astForStatement.init, astForStatement.body];
          break;
        case "ForInStatement":
          let astForInStatement: BabelNodeForInStatement = (ast: any);
          statements = [astForInStatement.left, astForInStatement.body];
          break;
        case "ForOfStatement":
          let astForOfStatement: BabelNodeForOfStatement = (ast: any);
          statements = [astForOfStatement.left, astForOfStatement.body];
          break;
        case "LabeledStatement":
          statements = [((ast: any): BabelNodeLabeledStatement).body];
          break;
        case "WithStatement":
          statements = [((ast: any): BabelNodeWithStatement).body];
          break;
        case "SwitchStatement":
          for (let switchCase of ((ast: any): BabelNodeSwitchStatement).cases) {
            statements = statements.concat(switchCase.consequent);
          }
          break;
        case "TryStatement":
          let astTryStatement: BabelNodeTryStatement = (ast: any);
          statements = [astTryStatement.block];
          if (astTryStatement.finalizer) statements.push(astTryStatement.finalizer);
          if (astTryStatement.handler) statements.push(astTryStatement.handler.body);
          break;
        case "VariableDeclaration":
          return ((ast: any): BabelNodeVariableDeclaration).kind === "var" ? [ast] : [];
        case "FunctionDeclaration":
          return level < 2 ? [ast] : [];
        default:
          return [];
      }

      let decls = [];
      for (let statement of statements) {
        if (statement) {
          decls = decls.concat(FindVarScopedDeclarationsFor(statement, level + 1));
        }
      }

      return decls;
    }
    return FindVarScopedDeclarationsFor(ast_node, 0);
  }

  // ECMA262 9.2.12
  FunctionDeclarationInstantiation(
    realm: Realm,
    func: ECMAScriptSourceFunctionValue,
    argumentsList: Array<Value>
  ): EmptyValue {
    // 1. Let calleeContext be the running execution context.
    let calleeContext = realm.getRunningContext();

    // 2. Let env be the LexicalEnvironment of calleeContext.
    let env = calleeContext.lexicalEnvironment;

    // 3. Let envRec be env's EnvironmentRecord.
    let envRec = env.environmentRecord;

    // 4. Let code be the value of the [[ECMAScriptCode]] internal slot of func.
    let code = func.$ECMAScriptCode;
    invariant(code !== undefined);

    // 5. Let strict be the value of the [[Strict]] internal slot of func.
    let strict = func.$Strict;

    // 6. Let formals be the value of the [[FormalParameters]] internal slot of func.
    let formals = func.$FormalParameters;
    invariant(formals !== undefined);

    // 7. Let parameterNames be the BoundNames of formals.
    let parameterNames = Object.create(null);
    for (let param of formals) {
      let paramBindings = t.getBindingIdentifiers(param, true);

      for (let name in paramBindings) {
        parameterNames[name] = (parameterNames[name] || []).concat(paramBindings[name]);
      }
    }

    // 8. If parameterNames has any duplicate entries, let hasDuplicates be true. Otherwise, let hasDuplicates be false.
    let hasDuplicates = false;
    for (let name in parameterNames) {
      let identifiers = parameterNames[name];
      if (identifiers.length > 1) hasDuplicates = true;
    }
    parameterNames = Object.keys(parameterNames);

    // 9. Let simpleParameterList be IsSimpleParameterList of formals.
    let simpleParameterList = true;
    for (let param of formals) {
      if (param.type !== "Identifier") {
        simpleParameterList = false;
        break;
      }
    }

    // 10. Let hasParameterExpressions be ContainsExpression of formals.
    let hasParameterExpressions = false;
    invariant(formals !== undefined);
    for (let param of formals) {
      if (Environment.ContainsExpression(realm, param)) {
        hasParameterExpressions = true;
        break;
      }
    }

    // 11. Let varNames be the VarDeclaredNames of code.
    let varNames = [];
    traverseFast(code, node => {
      if (node.type === "VariableDeclaration" && ((node: any): BabelNodeVariableDeclaration).kind === "var") {
        varNames = varNames.concat(Object.keys(t.getBindingIdentifiers(node)));
      }

      if (node.type === "FunctionExpression" || node.type === "FunctionDeclaration") {
        return true;
      }

      return false;
    });

    // 12. Let varDeclarations be the VarScopedDeclarations of code.
    let varDeclarations = this.FindVarScopedDeclarations(code);

    // 13. Let lexicalNames be the LexicallyDeclaredNames of code.
    let lexicalNames = [];

    // 14. Let functionNames be an empty List.
    let functionNames = [];

    // 15. Let functionsToInitialize be an empty List.
    let functionsToInitialize = [];

    // 16. For each d in varDeclarations, in reverse list order do
    for (let d of varDeclarations.reverse()) {
      // a. If d is neither a VariableDeclaration or a ForBinding, then
      if (d.type !== "VariableDeclaration") {
        // i. Assert: d is either a FunctionDeclaration or a GeneratorDeclaration.
        invariant(d.type === "FunctionDeclaration" || d.type === "GeneratorDeclaration");
        // ii. Let fn be the sole element of the BoundNames of d.
        let fn = Environment.BoundNames(realm, d)[0];
        // iii. If fn is not an element of functionNames, then
        if (functionNames.indexOf(fn) < 0) {
          // 1. Insert fn as the first element of functionNames.
          functionNames.unshift(fn);
          // 2. NOTE If there are multiple FunctionDeclarations or GeneratorDeclarations for the same name, the last declaration is used.
          // 3. Insert d as the first element of functionsToInitialize.
          functionsToInitialize.unshift(d);
        }
      }
    }

    // 17. Let argumentsObjectNeeded be true.
    let argumentsObjectNeeded = true;

    // 18. If the value of the [[realmMode]] internal slot of func is lexical, then
    if (func.$ThisMode === "lexical") {
      // a. NOTE Arrow functions never have an arguments objects.
      // b. Let argumentsObjectNeeded be false.
      argumentsObjectNeeded = false;
    } else if (parameterNames.indexOf("arguments") >= 0) {
      // 19. Else if "arguments" is an element of parameterNames, then
      // a. Let argumentsObjectNeeded be false.
      argumentsObjectNeeded = false;
    } else if (hasParameterExpressions === false) {
      // 20. Else if hasParameterExpressions is false, then
      // a. If "arguments" is an element of functionNames or if "arguments" is an element of lexicalNames, then
      if (functionNames.indexOf("arguments") >= 0 || lexicalNames.indexOf("arguments") >= 0) {
        // i. Let argumentsObjectNeeded be false.
        argumentsObjectNeeded = true;
      }
    }

    // 21. For each String paramName in parameterNames, do
    for (let paramName of parameterNames) {
      // a. Let alreadyDeclared be envRec.HasBinding(paramName).
      let alreadyDeclared = envRec.HasBinding(paramName);

      // b. NOTE Early errors ensure that duplicate parameter names can only occur in non-strict functions that do not have parameter default values or rest parameters.

      // c. If alreadyDeclared is false, then
      if (alreadyDeclared === false) {
        // i. Perform ! envRec.CreateMutableBinding(paramName, false).
        envRec.CreateMutableBinding(paramName, false);

        // ii. If hasDuplicates is true, then
        if (hasDuplicates === true) {
          // 1. Perform ! envRec.InitializeBinding(paramName, undefined).
          envRec.InitializeBinding(paramName, realm.intrinsics.undefined);
        }
      }
    }

    // 22. If argumentsObjectNeeded is true, then
    if (argumentsObjectNeeded === true) {
      let ao;

      // a. If strict is true or if simpleParameterList is false, then
      if (strict === true || simpleParameterList === false) {
        // i. Let ao be CreateUnmappedArgumentsObject(argumentsList).
        ao = Create.CreateUnmappedArgumentsObject(realm, argumentsList);
      } else {
        // b. Else,
        // i. NOTE mapped argument object is only provided for non-strict functions that don't have a rest parameter, any parameter default value initializers, or any destructured parameters.
        // ii. Let ao be CreateMappedArgumentsObject(func, formals, argumentsList, envRec).
        invariant(formals !== undefined);
        ao = Create.CreateMappedArgumentsObject(realm, func, formals, argumentsList, envRec);
      }

      // c. If strict is true, then
      if (strict === true) {
        // i. Perform ! envRec.CreateImmutableBinding("arguments", false).
        envRec.CreateImmutableBinding("arguments", false);
      } else {
        // d. Else,
        // i. Perform ! envRec.CreateMutableBinding("arguments", false).
        envRec.CreateMutableBinding("arguments", false);
      }

      // e. Call envRec.InitializeBinding("arguments", ao).
      envRec.InitializeBinding("arguments", ao);

      // f. Append "arguments" to parameterNames.
      parameterNames.push("arguments");
    }

    // 23. Let iteratorRecord be Record {[[Iterator]]: CreateListIterator(argumentsList), [[Done]]: false}.
    let iteratorRecord = {
      $Iterator: CreateListIterator(realm, argumentsList),
      $Done: false,
    };

    // 24. If hasDuplicates is true, then
    if (hasDuplicates === true) {
      // a. Perform ? IteratorBindingInitialization for formals with iteratorRecord and undefined as arguments.
      invariant(formals !== undefined);
      Environment.IteratorBindingInitialization(realm, formals, iteratorRecord, strict);
    } else {
      // 25. Else,
      // a. Perform ? IteratorBindingInitialization for formals with iteratorRecord and env as arguments.
      invariant(formals !== undefined);
      Environment.IteratorBindingInitialization(realm, formals, iteratorRecord, strict, env);
    }

    // 26. If hasParameterExpressions is false, then
    let varEnv, varEnvRec;
    if (hasParameterExpressions === false) {
      // a. NOTE Only a single lexical environment is needed for the parameters and top-level vars.
      // b. Let instantiatedVarNames be a copy of the List parameterNames.
      let instantiatedVarNames = parameterNames.slice();

      // c. For each n in varNames, do
      for (let n of varNames) {
        // i. If n is not an element of instantiatedVarNames, then
        if (instantiatedVarNames.indexOf(n) < 0) {
          // 1. Append n to instantiatedVarNames.
          instantiatedVarNames.push(n);

          // 2. Perform ! envRec.CreateMutableBinding(n, false).
          envRec.CreateMutableBinding(n, false);

          // 3. Call envRec.InitializeBinding(n, undefined).
          envRec.InitializeBinding(n, realm.intrinsics.undefined);
        }
      }

      // e. Let varEnv be env.
      varEnv = env;

      // f. Let varEnvRec be envRec.
      varEnvRec = envRec;
    } else {
      // 27. Else,
      // a. NOTE A separate Environment Record is needed to ensure that closures created by expressions in the formal parameter list do not have visibility of declarations in the function body.

      // b. Let varEnv be NewDeclarativeEnvironment(env).
      varEnv = Environment.NewDeclarativeEnvironment(realm, env);
      // At this point we haven't set any context's lexical environment to varEnv (and we might never do so),
      // so it shouldn't be active
      realm.activeLexicalEnvironments.delete(varEnv);

      // c. Let varEnvRec be varEnv's EnvironmentRecord.
      varEnvRec = varEnv.environmentRecord;

      // d. Set the VariableEnvironment of calleeContext to varEnv.
      calleeContext.variableEnvironment = varEnv;

      // e. Let instantiatedVarNames be a new empty List.
      let instantiatedVarNames = [];

      // f. For each n in varNames, do
      for (let n of varNames) {
        // i. If n is not an element of instantiatedVarNames, then
        if (instantiatedVarNames.indexOf(n) < 0) {
          // 1. Append n to instantiatedVarNames.
          instantiatedVarNames.push(n);

          // 2. Perform ! varEnvRec.CreateMutableBinding(n, false).
          varEnvRec.CreateMutableBinding(n, false);

          // 3. If n is not an element of parameterNames or if n is an element of functionNames, let initialValue be undefined.
          let initialValue;
          if (parameterNames.indexOf(n) < 0 || functionNames.indexOf(n) < 0) {
            initialValue = realm.intrinsics.undefined;
          } else {
            // 4. Else,
            // a. Let initialValue be ! envRec.GetBindingValue(n, false).
            initialValue = envRec.GetBindingValue(n, false);
          }

          // 5. Call varEnvRec.InitializeBinding(n, initialValue).
          varEnvRec.InitializeBinding(n, initialValue);

          // 6. NOTE vars whose names are the same as a formal parameter, initially have the same value as the corresponding initialized parameter.
        }
      }
    }

    // 28. NOTE: Annex B.3.3.1 adds additional steps at realm point.

    let lexEnv;

    // 29. If strict is false, then
    if (strict === false) {
      // a. Let lexEnv be NewDeclarativeEnvironment(varEnv).
      lexEnv = Environment.NewDeclarativeEnvironment(realm, varEnv);

      // b. NOTE: Non-strict functions use a separate lexical Environment Record for top-level lexical declarations so that a direct eval (see 12.3.4.1) can determine whether any var scoped declarations introduced by the eval code conflict with pre-existing top-level lexically scoped declarations. realm is not needed for strict functions because a strict direct eval always places all declarations into a new Environment Record.
    } else {
      // 30. Else, let lexEnv be varEnv.
      lexEnv = varEnv;
      // Since we previously removed varEnv, make sure to re-add it when it's used.
      realm.activeLexicalEnvironments.add(varEnv);
    }

    // 31. Let lexEnvRec be lexEnv's EnvironmentRecord.
    let lexEnvRec = lexEnv.environmentRecord;

    // 32. Set the LexicalEnvironment of calleeContext to lexEnv.
    calleeContext.lexicalEnvironment = lexEnv;

    // 33. Let lexDeclarations be the LexicallyScopedDeclarations of code.
    let lexDeclarations = [];

    // 34. For each element d in lexDeclarations do
    for (let d of lexDeclarations) {
      // a. NOTE A lexically declared name cannot be the same as a function/generator declaration, formal parameter, or a var name. Lexically declared names are only instantiated here but not initialized.
      // b. For each element dn of the BoundNames of d do
      for (let dn of Environment.BoundNames(realm, d)) {
        // i. If IsConstantDeclaration of d is true, then
        if (d.kind === "const") {
          // 1. Perform ! lexEnvRec.CreateImmutableBinding(dn, true).
          lexEnvRec.CreateImmutableBinding(dn, true);
        } else {
          // ii. Else,
          // 1. Perform ! lexEnvRec.CreateMutableBinding(dn, false).
          lexEnvRec.CreateMutableBinding(dn, false);
        }
      }
    }

    // 35. For each parsed grammar phrase f in functionsToInitialize, do
    for (let f of functionsToInitialize) {
      // a. Let fn be the sole element of the BoundNames of f.
      let fn = Environment.BoundNames(realm, f)[0];
      // b. Let fo be the result of performing InstantiateFunctionObject for f with argument lexEnv.
      let fo = lexEnv.evaluate(f, strict);
      invariant(fo instanceof Value);
      // c. Perform ! varEnvRec.SetMutableBinding(fn, fo, false).
      varEnvRec.SetMutableBinding(fn, fo, false);
    }

    // 36. Return NormalCompletion(empty).
    return realm.intrinsics.empty;
  }

  // ECMA262 9.2.11
  SetFunctionName(realm: Realm, F: ObjectValue, _name: PropertyKeyValue | AbstractValue, prefix?: string): boolean {
    // 1. Assert: F is an extensible object that does not have a name own property.
    invariant(F.getExtensible(), "expected object to be extensible and not have a name property");

    // 2. Assert: Type(name) is either Symbol or String.
    invariant(
      typeof _name === "string" ||
        _name instanceof StringValue ||
        _name instanceof SymbolValue ||
        _name instanceof AbstractValue,
      "expected name to be a string or symbol"
    );
    let name = typeof _name === "string" ? new StringValue(realm, _name) : _name;

    // 3. Assert: If prefix was passed, then Type(prefix) is String.
    invariant(prefix === undefined || typeof prefix === "string", "expected prefix to be a string if passed");

    // 4. If Type(name) is Symbol, then
    if (name instanceof SymbolValue) {
      // a. Let description be name's [[Description]] value.
      let description = name.$Description;

      // b. If description is undefined, let name be the empty String.
      if (description === undefined) {
        name = realm.intrinsics.emptyString;
      } else {
        // c. Else, let name be the concatenation of "[", description, and "]".
        invariant(description instanceof Value);
        name = new StringValue(realm, `[${description.throwIfNotConcreteString().value}]`);
      }
    }

    // 5. If prefix was passed, then
    if (prefix) {
      // a. Let name be the concatenation of prefix, code unit 0x0020 (SPACE), and name.
      if (name instanceof AbstractValue) {
        let prefixVal = new StringValue(realm, prefix + " ");
        name = AbstractValue.createFromBinaryOp(realm, "+", prefixVal, name, name.expressionLocation);
      } else {
        name = new StringValue(realm, `${prefix} ${name.value}`);
      }
    }

    // 6. Return ! DefinePropertyOrThrow(F, "name", PropertyDescriptor{[[Value]]: name, [[Writable]]: false, [[Enumerable]]: false, [[Configurable]]: true}).
    return Properties.DefinePropertyOrThrow(realm, F, "name", {
      value: name,
      enumerable: false,
      writable: false,
      configurable: true,
    });
  }

  // ECMA262 9.2.3
  FunctionInitialize(
    realm: Realm,
    F: ECMAScriptSourceFunctionValue,
    kind: "normal" | "method" | "arrow",
    ParameterList: Array<BabelNodeLVal>,
    Body: BabelNodeBlockStatement,
    Scope: LexicalEnvironment
  ): ECMAScriptSourceFunctionValue {
    // Note that F is a new object, and we can thus write to internal slots
    invariant(realm.isNewObject(F));

    // 1. Assert: F is an extensible object that does not have a length own property.
    invariant(F.getExtensible(), "expected to be extensible and no length property");

    // 2. Let len be the ExpectedArgumentCount of ParameterList.
    let len = 0;
    for (let FormalParameter of ParameterList) {
      if (FormalParameter.type === "AssignmentPattern") {
        break;
      }
      len += 1;
    }

    // 3. Perform ! DefinePropertyOrThrow(F, "length", PropertyDescriptor{[[Value]]: len, [[Writable]]: false, [[Enumerable]]: false, [[Configurable]]: true}).
    Properties.DefinePropertyOrThrow(realm, F, "length", {
      value: new NumberValue(realm, len),
      writable: false,
      enumerable: false,
      configurable: true,
    });

    // 4. Let Strict be the value of the [[Strict]] internal slot of F.
    let Strict = F.$Strict;
    if (!Strict) {
      Properties.DefinePropertyOrThrow(realm, F, "caller", {
        value: new UndefinedValue(realm),
        writable: true,
        enumerable: false,
        configurable: true,
      });
    }

    // 5. Set the [[Environment]] internal slot of F to the value of Scope.
    F.$Environment = Scope;

    // 6. Set the [[FormalParameters]] internal slot of F to ParameterList.
    F.$FormalParameters = ParameterList;

    // 7. Set the [[ECMAScriptCode]] internal slot of F to Body.
    ((Body: any): FunctionBodyAstNode).uniqueOrderedTag = realm.functionBodyUniqueTagSeed++;
    F.$ECMAScriptCode = Body;

    // 8. Set the [[ScriptOrModule]] internal slot of F to GetActiveScriptOrModule().
    F.$ScriptOrModule = Environment.GetActiveScriptOrModule(realm);

    // 9. If kind is Arrow, set the [[realmMode]] internal slot of F to lexical.
    if (kind === "arrow") {
      F.$ThisMode = "lexical";
    } else if (Strict === true) {
      // 10. Else if Strict is true, set the [[realmMode]] internal slot of F to strict.
      F.$ThisMode = "strict";
    } else {
      // 11. Else set the [[realmMode]] internal slot of F to global.
      F.$ThisMode = "global";
    }

    // Return F.
    return F;
  }

  // ECMA262 9.2.6
  GeneratorFunctionCreate(
    realm: Realm,
    kind: "normal" | "method",
    ParameterList: Array<BabelNodeLVal>,
    Body: BabelNodeBlockStatement,
    Scope: LexicalEnvironment,
    Strict: boolean
  ): ECMAScriptSourceFunctionValue {
    // 1. Let functionPrototype be the intrinsic object %Generator%.
    let functionPrototype = realm.intrinsics.Generator;

    // 2. Let F be FunctionAllocate(functionPrototype, Strict, "generator").
    let F = this.FunctionAllocate(realm, functionPrototype, Strict, "generator");

    // 3. Return FunctionInitialize(F, kind, ParameterList, Body, Scope).
    return this.FunctionInitialize(realm, F, kind, ParameterList, Body, Scope);
  }

  // ECMA262 9.2.7
  AddRestrictedFunctionProperties(F: FunctionValue, realm: Realm): boolean {
    // 1. Assert: realm.[[Intrinsics]].[[%ThrowTypeError%]] exists and has been initialized.
    // 2. Let thrower be realm.[[Intrinsics]].[[%ThrowTypeError%]].
    let thrower = realm.intrinsics.ThrowTypeError;
    invariant(thrower);

    let desc = {
      get: thrower,
      set: thrower,
      enumerable: false,
      configurable: true,
    };
    // 3. Perform ! DefinePropertyOrThrow(F, "caller", PropertyDescriptor {[[Get]]: thrower, [[Set]]: thrower, [[Enumerable]]: false, [[Configurable]]: true}).
    Properties.DefinePropertyOrThrow(realm, F, "caller", desc);
    // 4. Return ! DefinePropertyOrThrow(F, "arguments", PropertyDescriptor {[[Get]]: thrower, [[Set]]: thrower, [[Enumerable]]: false, [[Configurable]]: true}).
    return Properties.DefinePropertyOrThrow(realm, F, "arguments", desc);
  }

  // ECMA262 9.2.1
  $Call(realm: Realm, F: ECMAScriptFunctionValue, thisArgument: Value, argsList: Array<Value>): Value {
    return InternalCall(realm, F, thisArgument, argsList, 0);
  }

  // ECMA262 9.2.2
  $Construct(
    realm: Realm,
    F: ECMAScriptFunctionValue,
    argumentsList: Array<Value>,
    newTarget: ObjectValue
  ): ObjectValue {
    return InternalConstruct(realm, F, argumentsList, newTarget, undefined, 0);
  }

  // ECMA262 9.2.3
  FunctionAllocate(
    realm: Realm,
    functionPrototype: ObjectValue | AbstractObjectValue,
    strict: boolean,
    functionKind: "normal" | "non-constructor" | "generator"
  ): ECMAScriptSourceFunctionValue {
    // 1. Assert: Type(functionPrototype) is Object.
    invariant(functionPrototype instanceof ObjectValue, "expected functionPrototype to be an object");

    // 2. Assert: functionKind is either "normal", "non-constructor" or "generator".
    invariant(
      functionKind === "normal" || functionKind === "non-constructor" || functionKind === "generator",
      "invalid functionKind"
    );

    // 3. If functionKind is "normal", let needsConstruct be true.
    let needsConstruct;
    if (functionKind === "normal") {
      needsConstruct = true;
    } else {
      // 4. Else, let needsConstruct be false.
      needsConstruct = false;
    }

    // 5. If functionKind is "non-constructor", let functionKind be "normal".
    if (functionKind === "non-constructor") {
      functionKind = "normal";
    }

    // 6. Let F be a newly created ECMAScript function object with the internal slots listed in Table 27. All of those internal slots are initialized to undefined.
    let F = new ECMAScriptSourceFunctionValue(realm);

    // 7. Set F's essential internal methods to the default ordinary object definitions specified in 9.1.

    // 8. Set F's [[Call]] internal method to the definition specified in 9.2.1.
    F.$Call = (thisArgument, argsList) => {
      return this.$Call(realm, F, thisArgument, argsList);
    };

    // 9. If needsConstruct is true, then
    if (needsConstruct === true) {
      // a. Set F's [[Construct]] internal method to the definition specified in 9.2.2.
      F.$Construct = (argumentsList, newTarget) => {
        return this.$Construct(realm, F, argumentsList, newTarget);
      };

      // b. Set the [[ConstructorKind]] internal slot of F to "base".
      F.$ConstructorKind = "base";
    }

    // 10. Set the [[Strict]] internal slot of F to strict.
    F.$Strict = strict;

    // 11. Set the [[FunctionKind]] internal slot of F to functionKind.
    F.$FunctionKind = functionKind;

    // 12. Set the [[Prototype]] internal slot of F to functionPrototype.
    F.$Prototype = functionPrototype;

    // 13. Set the [[Extensible]] internal slot of F to true.
    F.setExtensible(true);

    // 14. Set the [[Realm]] internal slot of F to the current Realm Record.
    F.$Realm = realm;

    // 15. Return F.
    return F;
  }

  // ECMA262 9.4.1.3
  BoundFunctionCreate(
    realm: Realm,
    targetFunction: ObjectValue,
    boundThis: Value,
    boundArgs: Array<Value>
  ): ObjectValue {
    // 1. Assert: Type(targetFunction) is Object.
    invariant(targetFunction instanceof ObjectValue, "expected an object");

    // 2. Let proto be ? targetFunction.[[GetPrototypeOf]]().
    let proto = targetFunction.$GetPrototypeOf();

    // 3. Let obj be a newly created object.
    let obj = new BoundFunctionValue(realm);

    // 4. Set obj's essential internal methods to the default ordinary object definitions specified in 9.1.

    // 5. Set the [[Call]] internal method of obj as described in 9.4.1.1.
    obj.$Call = (thisArgument, argsList) => {
      return $BoundCall(realm, obj, thisArgument, argsList);
    };

    // 6. If targetFunction has a [[Construct]] internal method, then
    if (targetFunction.$Construct) {
      // a. Set the [[Construct]] internal method of obj as described in 9.4.1.2.
      obj.$Construct = (thisArgument, argsList) => {
        return $BoundConstruct(realm, obj, thisArgument, argsList);
      };
    }

    // 7. Set the [[Prototype]] internal slot of obj to proto.
    obj.$Prototype = proto;

    // 8. Set the [[Extensible]] internal slot of obj to true.
    obj.setExtensible(true);

    // 9. Set the [[BoundTargetFunction]] internal slot of obj to targetFunction.
    obj.$BoundTargetFunction = targetFunction;

    // 10. Set the [[BoundThis]] internal slot of obj to the value of boundThis.
    obj.$BoundThis = boundThis;

    // 11. Set the [[BoundArguments]] internal slot of obj to boundArgs.
    obj.$BoundArguments = boundArgs;

    // 12. Return obj.
    return obj;
  }

  // ECMA262 18.2.1.1
  PerformEval(realm: Realm, x: Value, evalRealm: Realm, strictCaller: boolean, direct: boolean): Value {
    // 1. Assert: If direct is false, then strictCaller is also false.
    if (direct === false) invariant(strictCaller === false, "strictCaller is only allowed on direct eval");

    // 2. If Type(x) is not String, return x.
    if (!(x instanceof StringValue)) return x;

    // 3. Let script be the ECMAScript code that is the result of parsing x, interpreted as UTF-16 encoded Unicode text
    //    as described in 6.1.4, for the goal symbol Script. If the parse fails, throw a SyntaxError exception. If any
    //    early errors are detected, throw a SyntaxError or a ReferenceError exception, depending on the type of the
    //    error (but see also clause 16). Parsing and early error detection may be interweaved in an implementation
    //    dependent manner.
    let ast = parse(realm, x.value, "eval", "script");
    let script = ast.program;

    // 4. If script Contains ScriptBody is false, return undefined.
    if (!script.body) return realm.intrinsics.undefined;

    // 5. Let body be the ScriptBody of script.
    let body = t.blockStatement(script.body, script.directives);

    // 6. If strictCaller is true, let strictEval be true.
    let strictEval;
    if (strictCaller) {
      strictEval = true;
    } else {
      // 7. Else, let strictEval be IsStrict of script.
      strictEval = IsStrict(script);
    }

    // 8. Let ctx be the running execution context. If direct is true, ctx will be the execution context that
    //    performed the direct eval. If direct is false, ctx will be the execution context for the invocation of
    //    the eval function.
    let ctx = realm.getRunningContext();

    // 9. If direct is true, then
    let lexEnv, varEnv;
    if (direct) {
      // a. Let lexEnv be NewDeclarativeEnvironment(ctx's LexicalEnvironment).
      lexEnv = Environment.NewDeclarativeEnvironment(realm, ctx.lexicalEnvironment);

      // b. Let varEnv be ctx's VariableEnvironment.
      varEnv = ctx.variableEnvironment;
    } else {
      // 10. Else,
      // a. Let lexEnv be NewDeclarativeEnvironment(evalRealm.[[GlobalEnv]]).
      lexEnv = Environment.NewDeclarativeEnvironment(realm, evalRealm.$GlobalEnv);

      // b. Let varEnv be evalRealm.[[GlobalEnv]].
      varEnv = evalRealm.$GlobalEnv;
    }

    // 11. If strictEval is true, let varEnv be lexEnv.
    if (strictEval) varEnv = lexEnv;

    // 12. If ctx is not already suspended, suspend ctx.
    ctx.suspend();

    // 13. Let evalCxt be a new ECMAScript code execution context.
    let evalCxt = new ExecutionContext();
    evalCxt.isStrict = strictEval;

    // 14. Set the evalCxt's Function to null.
    evalCxt.setFunction(null);

    // 15. Set the evalCxt's Realm to evalRealm.
    evalCxt.setRealm(evalRealm);

    // 16. Set the evalCxt's ScriptOrModule to ctx's ScriptOrModule.
    evalCxt.ScriptOrModule = ctx.ScriptOrModule;

    // 17. Set the evalCxt's VariableEnvironment to varEnv.
    evalCxt.variableEnvironment = varEnv;

    // 18. Set the evalCxt's LexicalEnvironment to lexEnv.
    evalCxt.lexicalEnvironment = lexEnv;

    // 19. Push evalCxt on to the execution context stack; evalCxt is now the running execution context.
    realm.pushContext(evalCxt);

    let result;
    try {
      // 20. Let result be EvalDeclarationInstantiation(body, varEnv, lexEnv, strictEval).
      invariant(varEnv);
      try {
        result = this.EvalDeclarationInstantiation(realm, body, varEnv, lexEnv, strictEval);
      } catch (e) {
        if (e instanceof AbruptCompletion) {
          result = e;
        } else {
          throw e;
        }
      }
      invariant(result instanceof Value || result instanceof AbruptCompletion);

      // 21. If result.[[Type]] is normal, then
      if (result instanceof Value) {
        // Evaluate expressions that passed for directives.
        if (script.directives) {
          for (let directive of script.directives) {
            result = new StringValue(realm, directive.value.value);
          }
        }

        // a. Let result be the result of evaluating body.
        result = this.EvaluateStatements(script.body, result, strictEval, lexEnv, realm);
      }

      // 22. If result.[[Type]] is normal and result.[[Value]] is empty, then
      if (result instanceof EmptyValue) {
        // a. Let result be NormalCompletion(undefined).
        result = realm.intrinsics.undefined;
      }
    } finally {
      // 23. Suspend evalCxt and remove it from the execution context stack.
      evalCxt.suspend();
      realm.popContext(evalCxt);
      realm.onDestroyScope(evalCxt.lexicalEnvironment);
    }

    // 24. Resume the context that is now on the top of the execution context stack as the running execution context.
    invariant(realm.getRunningContext() === ctx);
    ctx.resume();

    // 25. Return Completion(result).
    if (result instanceof Value) {
      return result;
    } else {
      invariant(result instanceof AbruptCompletion);
      throw result;
    }
  }

  // If c is an abrupt completion and realm.savedCompletion is defined, the result is an instance of
  // ForkedAbruptCompletion and the effects that have been captured since the PossiblyNormalCompletion instance
  // in realm.savedCompletion has been created, becomes the effects of the branch that terminates in c.
  // If c is a normal completion, the result is realm.savedCompletion, with its value updated to c.
  // If c is undefined, the result is just realm.savedCompletion.
  // Call this only when a join point has been reached.
  incorporateSavedCompletion(realm: Realm, c: void | AbruptCompletion | Value): void | Completion | Value {
    let savedCompletion = realm.savedCompletion;
    if (savedCompletion !== undefined) {
      if (savedCompletion.savedPathConditions) {
        // Since we are joining several control flow paths, we need the curent path conditions to reflect
        // only the refinements that applied at the corresponding fork point.
        realm.pathConditions = savedCompletion.savedPathConditions;
        savedCompletion.savedPathConditions = [];
      }
      realm.savedCompletion = undefined;
      if (c === undefined) return savedCompletion;
      if (c instanceof Value) {
        Join.updatePossiblyNormalCompletionWithValue(realm, savedCompletion, c);
        return savedCompletion;
      } else {
        let e = realm.getCapturedEffects();
        realm.stopEffectCaptureAndUndoEffects(savedCompletion);
        return Join.replacePossiblyNormalCompletionWithForkedAbruptCompletion(realm, savedCompletion, c, e);
      }
    }
    return c;
  }

  EvaluateStatements(
    body: Array<BabelNodeStatement>,
    initialBlockValue: void | Value,
    strictCode: boolean,
    blockEnv: LexicalEnvironment,
    realm: Realm
  ): Value {
    let blockValue = initialBlockValue;
    for (let node of body) {
      if (node.type !== "FunctionDeclaration") {
        let res = blockEnv.evaluateCompletionDeref(node, strictCode);
        if (!(res instanceof EmptyValue)) {
          if (res instanceof AbruptCompletion) throw UpdateEmpty(realm, res, blockValue || realm.intrinsics.empty);
          invariant(res instanceof Value);
          blockValue = res;
        }
      }
    }

    // 7. Return blockValue.
    return blockValue || realm.intrinsics.empty;
  }

  PartiallyEvaluateStatements(
    body: Array<BabelNodeStatement>,
    blockValue: void | NormalCompletion | Value,
    strictCode: boolean,
    blockEnv: LexicalEnvironment,
    realm: Realm
  ): [Completion | Value, Array<BabelNodeStatement>] {
    let statementAsts = [];
    for (let node of body) {
      if (node.type !== "FunctionDeclaration") {
        let [res, nast, nio] = blockEnv.partiallyEvaluateCompletionDeref(node, strictCode);
        for (let ioAst of nio) statementAsts.push(ioAst);
        statementAsts.push((nast: any));
        if (!(res instanceof EmptyValue)) {
          if (blockValue === undefined || blockValue instanceof Value) {
            if (res instanceof AbruptCompletion)
              return [UpdateEmpty(realm, res, blockValue || realm.intrinsics.empty), statementAsts];
            invariant(res instanceof NormalCompletion || res instanceof Value);
            blockValue = res;
          }
        }
      }
    }

    // 7. Return blockValue.
    return [blockValue || realm.intrinsics.empty, statementAsts];
  }

  // ECMA262 9.2.5
  FunctionCreate(
    realm: Realm,
    kind: "normal" | "arrow" | "method",
    ParameterList: Array<BabelNodeLVal>,
    Body: BabelNodeBlockStatement,
    Scope: LexicalEnvironment,
    Strict: boolean,
    prototype?: ObjectValue
  ): ECMAScriptSourceFunctionValue {
    // 1. If the prototype argument was not passed, then
    if (!prototype) {
      // a. Let prototype be the intrinsic object %FunctionPrototype%.
      prototype = realm.intrinsics.FunctionPrototype;
    }

    // 2. If kind is not Normal, let allocKind be "non-constructor".
    let allocKind;
    if (kind !== "normal") {
      allocKind = "non-constructor";
    } else {
      // 3. Else, let allocKind be "normal".
      allocKind = "normal";
    }

    // 4. Let F be FunctionAllocate(prototype, Strict, allocKind).
    let F = this.FunctionAllocate(realm, prototype, Strict, allocKind);

    // ECMAScript 2016, section 17:
    //   "Every other data property described in clauses 18 through 26 and in Annex B.2 has the attributes { [[Writable]]: true, [[Enumerable]]: false, [[Configurable]]: true } unless otherwise specified."
    // Because we call `AddRestrictedFunctionProperties` on `FunctionPrototype`, accessing property "arguments" will raise a `TypeError` by default.
    // However, in non-strict mode this behavior is not desired, so we will add them as own properties of each `FunctionValue`, in accordance with ECMA 17.
    // Note: "arguments" ***MUST NOT*** be set if the function is in strict mode or is an arrow, method, constructor, or generator function.
    //   See 16.2 "Forbidden Extensions"
    if (!Strict && kind === "normal") {
      Properties.DefinePropertyOrThrow(realm, F, "arguments", {
        value: realm.intrinsics.undefined,
        enumerable: false,
        writable: true,
        configurable: true,
      });
    }

    // 5. Return FunctionInitialize(F, kind, ParameterList, Body, Scope).
    return this.FunctionInitialize(realm, F, kind, ParameterList, Body, Scope);
  }

  // ECMA262 18.2.1.2
  EvalDeclarationInstantiation(
    realm: Realm,
    body: BabelNodeBlockStatement,
    varEnv: LexicalEnvironment,
    lexEnv: LexicalEnvironment,
    strict: boolean
  ): Value {
    // 1. Let varNames be the VarDeclaredNames of body.
    let varNames = [];
    traverseFast(body, node => {
      if (node.type === "VariableDeclaration" && ((node: any): BabelNodeVariableDeclaration).kind === "var") {
        varNames = varNames.concat(Object.keys(t.getBindingIdentifiers(node)));
      }

      if (node.type === "FunctionExpression" || node.type === "FunctionDeclaration") {
        return true;
      }

      return false;
    });

    // 2. Let varDeclarations be the VarScopedDeclarations of body.
    let varDeclarations = this.FindVarScopedDeclarations(body);

    // 3. Let lexEnvRec be lexEnv's EnvironmentRecord.
    let lexEnvRec = lexEnv.environmentRecord;

    // 4. Let varEnvRec be varEnv's EnvironmentRecord.
    let varEnvRec = varEnv.environmentRecord;

    // 5. If strict is false, then
    if (!strict) {
      // a. If varEnvRec is a global Environment Record, then
      if (varEnvRec instanceof GlobalEnvironmentRecord) {
        // i. For each name in varNames, do
        for (let name of varNames) {
          // 1. If varEnvRec.HasLexicalDeclaration(name) is true, throw a SyntaxError exception.
          if (varEnvRec.HasLexicalDeclaration(name)) {
            throw realm.createErrorThrowCompletion(
              realm.intrinsics.SyntaxError,
              new StringValue(realm, name + " global object is restricted")
            );
          }
          // 2. NOTE: eval will not create a global var declaration that would be shadowed by a global lexical declaration.
        }
      }
      // b. Let thisLex be lexEnv.
      let thisLex = lexEnv;
      // c. Assert: The following loop will terminate.
      // d. Repeat while thisLex is not the same as varEnv,
      while (thisLex !== varEnv) {
        // i. Let thisEnvRec be thisLex's EnvironmentRecord.
        let thisEnvRec = thisLex.environmentRecord;
        // ii. If thisEnvRec is not an object Environment Record, then
        if (!(thisEnvRec instanceof ObjectEnvironmentRecord)) {
          // 1. NOTE: The environment of with statements cannot contain any lexical declaration so it doesn't need to be checked for var/let hoisting conflicts.
          // 2. For each name in varNames, do
          for (let name of varNames) {
            // a. If thisEnvRec.HasBinding(name) is true, then
            if (thisEnvRec.HasBinding(name)) {
              // i. Throw a SyntaxError exception.
              throw realm.createErrorThrowCompletion(
                realm.intrinsics.SyntaxError,
                name + " global object is restricted"
              );
              // ii. NOTE: Annex B.3.5 defines alternate semantics for the above step.
            }
            // b. NOTE: A direct eval will not hoist var declaration over a like-named lexical declaration.
          }
        }
        // iii. Let thisLex be thisLex's outer environment reference.
        thisLex = thisLex.parent;
        invariant(thisLex !== null);
      }
    }

    // 6. Let functionsToInitialize be a new empty List.
    let functionsToInitialize = [];

    // 7. Let declaredFunctionNames be a new empty List.
    let declaredFunctionNames = [];

    // 8. For each d in varDeclarations, in reverse list order do
    for (let d of varDeclarations.reverse()) {
      // a. If d is neither a VariableDeclaration or a ForBinding, then
      if (d.type !== "VariableDeclaration") {
        // i. Assert: d is either a FunctionDeclaration or a GeneratorDeclaration.
        invariant(d.type === "FunctionDeclaration" || d.type === "GeneratorDeclaration");
        // ii. NOTE If there are multiple FunctionDeclarations for the same name, the last declaration is used.
        // iii. Let fn be the sole element of the BoundNames of d.
        let fn = Environment.BoundNames(realm, d)[0];
        // iv. If fn is not an element of declaredFunctionNames, then
        if (declaredFunctionNames.indexOf(fn) < 0) {
          // 1. If varEnvRec is a global Environment Record, then
          if (varEnvRec instanceof GlobalEnvironmentRecord) {
            // a. Let fnDefinable be ? varEnvRec.CanDeclareGlobalFunction(fn).
            let fnDefinable = varEnvRec.CanDeclareGlobalFunction(fn);
            // b. If fnDefinable is false, throw a TypeError exception.
            if (!fnDefinable) {
              throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, fn + " is not definable");
            }
          }
          // 2. Append fn to declaredFunctionNames.
          declaredFunctionNames.push(fn);
          // 3. Insert d as the first element of functionsToInitialize.
          functionsToInitialize.unshift(d);
        }
      }
    }

    // 9. NOTE: Annex B.3.3.3 adds additional steps at this point.

    // 10. Let declaredVarNames be a new empty List.
    let declaredVarNames = [];

    // 11. For each d in varDeclarations, do
    for (let d of varDeclarations) {
      // a. If d is a VariableDeclaration or a ForBinding, then
      if (d.type === "VariableDeclaration") {
        // i. For each String vn in the BoundNames of d, do
        for (let vn of Environment.BoundNames(realm, d)) {
          // 1. If vn is not an element of declaredFunctionNames, then
          if (declaredFunctionNames.indexOf(vn) < 0) {
            // a. If varEnvRec is a global Environment Record, then
            if (varEnvRec instanceof GlobalEnvironmentRecord) {
              // i. Let vnDefinable be ? varEnvRec.CanDeclareGlobalVar(vn).
              let vnDefinable = varEnvRec.CanDeclareGlobalVar(vn);
              // ii. If vnDefinable is false, throw a TypeError exception.
              if (!vnDefinable) {
                throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, vn + " is not definable");
              }
            }
            // b. If vn is not an element of declaredVarNames, then
            if (declaredVarNames.indexOf(vn) < 0) {
              // i. Append vn to declaredVarNames.
              declaredVarNames.push(vn);
            }
          }
        }
      }
    }

    // 12. NOTE: No abnormal terminations occur after this algorithm step unless varEnvRec is a global Environment Record and the global object is a Proxy exotic object.

    // 13. Let lexDeclarations be the LexicallyScopedDeclarations of body.
    let lexDeclarations = [];
    for (let s of body.body) {
      if (s.type === "VariableDeclaration" && s.kind !== "var") {
        lexDeclarations.push(s);
      }
    }

    // 14. For each element d in lexDeclarations do
    for (let d of lexDeclarations) {
      // a. NOTE Lexically declared names are only instantiated here but not initialized.
      // b. For each element dn of the BoundNames of d do
      for (let dn of Environment.BoundNames(realm, d)) {
        // c. If IsConstantDeclaration of d is true, then
        if (d.kind === "const") {
          // i. Perform ? lexEnvRec.CreateImmutableBinding(dn, true).
          lexEnvRec.CreateImmutableBinding(dn, true);
        } else {
          // d. Else,
          // i. Perform ? lexEnvRec.CreateMutableBinding(dn, false).
          lexEnvRec.CreateMutableBinding(dn, false);
        }
      }
    }

    // 15. For each production f in functionsToInitialize, do
    for (let f of functionsToInitialize) {
      // a. Let fn be the sole element of the BoundNames of f.
      let fn = Environment.BoundNames(realm, f)[0];
      // b. Let fo be the result of performing InstantiateFunctionObject for f with argument lexEnv.
      let fo = lexEnv.evaluate(f, strict);
      invariant(fo instanceof Value);
      // c. If varEnvRec is a global Environment Record, then
      if (varEnvRec instanceof GlobalEnvironmentRecord) {
        // i. Perform ? varEnvRec.CreateGlobalFunctionBinding(fn, fo, true).
        varEnvRec.CreateGlobalFunctionBinding(fn, fo, true);
      } else {
        // d. Else,
        // i. Let bindingExists be varEnvRec.HasBinding(fn).
        let bindingExists = varEnvRec.HasBinding(fn);
        // ii. If bindingExists is false, then
        if (!bindingExists) {
          // 1. Let status be ! varEnvRec.CreateMutableBinding(fn, true).
          varEnvRec.CreateMutableBinding(fn, true);
          // 2. Assert: status is not an abrupt completion because of validation preceding step 12.
          // 3. Perform ! varEnvRec.InitializeBinding(fn, fo).
          varEnvRec.InitializeBinding(fn, fo);
        } else {
          // iii. Else,
          // 1. Perform ! varEnvRec.SetMutableBinding(fn, fo, false).
          varEnvRec.SetMutableBinding(fn, fo, false);
        }
      }
    }

    // 16. For each String vn in declaredVarNames, in list order do
    for (let vn of declaredVarNames) {
      // a. If varEnvRec is a global Environment Record, then
      if (varEnvRec instanceof GlobalEnvironmentRecord) {
        // i. Perform ? varEnvRec.CreateGlobalVarBinding(vn, true).
        varEnvRec.CreateGlobalVarBinding(vn, true);
      } else {
        // b. Else,
        // i. Let bindingExists be varEnvRec.HasBinding(vn).
        let bindingExists = varEnvRec.HasBinding(vn);
        // ii. If bindingExists is false, then
        if (!bindingExists) {
          // 1. Let status be ! varEnvRec.CreateMutableBinding(vn, true).
          varEnvRec.CreateMutableBinding(vn, true);
          // 2. Assert: status is not an abrupt completion because of validation preceding step 12.
          // 3. Perform ! varEnvRec.InitializeBinding(vn, undefined).
          varEnvRec.InitializeBinding(vn, realm.intrinsics.undefined);
        }
      }
    }

    // 17. Return NormalCompletion(empty).
    return realm.intrinsics.empty;
  }

  // ECMA 9.2.10
  MakeMethod(realm: Realm, F: ECMAScriptSourceFunctionValue, homeObject: ObjectValue): Value {
    // Note that F is a new object, and we can thus write to internal slots
    invariant(realm.isNewObject(F));

    // 1. Assert: F is an ECMAScript function object.
    invariant(F instanceof ECMAScriptSourceFunctionValue, "F is an ECMAScript function object.");

    // 2. Assert: Type(homeObject) is Object.
    invariant(homeObject instanceof ObjectValue, "Type(homeObject) is Object.");

    // 3. Set the [[HomeObject]] internal slot of F to homeObject.
    F.$HomeObject = homeObject;

    // 4. Return NormalCompletion(undefined).
    return realm.intrinsics.undefined;
  }

  // ECMA 14.3.8
  DefineMethod(
    realm: Realm,
    prop: BabelNodeObjectMethod | BabelNodeClassMethod,
    obj: ObjectValue,
    env: LexicalEnvironment,
    strictCode: boolean,
    functionPrototype?: ObjectValue
  ): { $Key: PropertyKeyValue, $Closure: ECMAScriptSourceFunctionValue } {
    // 1. Let propKey be the result of evaluating PropertyName.
    let propKey = EvalPropertyName(prop, env, realm, strictCode);

    // 2. ReturnIfAbrupt(propKey).

    // 3. If the function code for this MethodDefinition is strict mode code, let strict be true. Otherwise let strict be false.
    let strict = strictCode || IsStrict(prop.body);

    // 4. Let scope be the running execution context's LexicalEnvironment.
    let scope = env;

    // 5. If functionPrototype was passed as a parameter, let kind be Normal; otherwise let kind be Method.
    let kind;
    if (functionPrototype) {
      // let kind be Normal;
      kind = "normal";
    } else {
      // otherwise let kind be Method.
      kind = "method";
    }

    // 6. Let closure be FunctionCreate(kind, StrictFormalParameters, FunctionBody, scope, strict). If functionPrototype was passed as a parameter, then pass its value as the prototype optional argument of FunctionCreate.
    let closure = this.FunctionCreate(realm, kind, prop.params, prop.body, scope, strict, functionPrototype);

    // 7. Perform MakeMethod(closure, object).
    this.MakeMethod(realm, closure, obj);

    // 8. Return the Record{[[Key]]: propKey, [[Closure]]: closure}.
    return { $Key: propKey, $Closure: closure };
  }
}
