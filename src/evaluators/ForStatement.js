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
import { Realm } from "../realm.js";
import {
  AbstractValue,
  Value,
  EmptyValue,
  ECMAScriptSourceFunctionValue,
  type UndefinedValue,
} from "../values/index.js";
import {
  AbruptCompletion,
  BreakCompletion,
  Completion,
  ContinueCompletion,
  JoinedAbruptCompletions,
  JoinedNormalAndAbruptCompletions,
  ReturnCompletion,
  ThrowCompletion,
  SimpleNormalCompletion,
} from "../completions.js";
import traverse from "@babel/traverse";
import type { BabelTraversePath } from "@babel/traverse";
import { TypesDomain, ValuesDomain } from "../domains/index.js";
import { CompilerDiagnostic, FatalError } from "../errors.js";
import { UpdateEmpty } from "../methods/index.js";
import { LoopContinues, InternalGetResultValue } from "./ForOfStatement.js";
import { Environment, Functions, Leak, To } from "../singletons.js";
import invariant from "../invariant.js";
import * as t from "@babel/types";
import type { BabelNodeExpression, BabelNodeForStatement, BabelNodeBlockStatement } from "@babel/types";
import { createOperationDescriptor } from "../utils/generator.js";

type BailOutWrapperInfo = {
  usesArguments: boolean,
  usesThis: boolean,
  usesReturn: boolean,
  usesGotoToLabel: boolean,
  usesThrow: boolean,
  varPatternUnsupported: boolean,
};

// ECMA262 13.7.4.9
export function CreatePerIterationEnvironment(realm: Realm, perIterationBindings: Array<string>): UndefinedValue {
  // 1. If perIterationBindings has any elements, then
  if (perIterationBindings.length > 0) {
    // a. Let lastIterationEnv be the running execution context's LexicalEnvironment.
    let lastIterationEnv = realm.getRunningContext().lexicalEnvironment;
    // b. Let lastIterationEnvRec be lastIterationEnv's EnvironmentRecord.
    let lastIterationEnvRec = lastIterationEnv.environmentRecord;
    // c. Let outer be lastIterationEnv's outer environment reference.
    let outer = lastIterationEnv.parent;
    // d. Assert: outer is not null.
    invariant(outer !== null);
    // e. Let thisIterationEnv be NewDeclarativeEnvironment(outer).
    let thisIterationEnv = Environment.NewDeclarativeEnvironment(realm, outer);
    // f. Let thisIterationEnvRec be thisIterationEnv's EnvironmentRecord.
    realm.onDestroyScope(lastIterationEnv);
    let thisIterationEnvRec = thisIterationEnv.environmentRecord;
    // g. For each element bn of perIterationBindings do,
    for (let bn of perIterationBindings) {
      // i. Perform ! thisIterationEnvRec.CreateMutableBinding(bn, false).
      thisIterationEnvRec.CreateMutableBinding(bn, false);
      // ii. Let lastValue be ? lastIterationEnvRec.GetBindingValue(bn, true).
      let lastValue = lastIterationEnvRec.GetBindingValue(bn, true);
      // iii.Perform thisIterationEnvRec.InitializeBinding(bn, lastValue).
      thisIterationEnvRec.InitializeBinding(bn, lastValue);
    }
    // h. Set the running execution context's LexicalEnvironment to thisIterationEnv.
    realm.getRunningContext().lexicalEnvironment = thisIterationEnv;
  }
  // 2. Return undefined.
  return realm.intrinsics.undefined;
}

// ECMA262 13.7.4.8
function ForBodyEvaluation(
  realm: Realm,
  test,
  increment,
  stmt,
  perIterationBindings: Array<string>,
  labelSet: ?Array<string>,
  strictCode: boolean
): Value {
  // 1. Let V be undefined.
  let V: Value = realm.intrinsics.undefined;

  // 2. Perform ? CreatePerIterationEnvironment(perIterationBindings).
  CreatePerIterationEnvironment(realm, perIterationBindings);
  let env = realm.getRunningContext().lexicalEnvironment;
  let possibleInfiniteLoopIterations = 0;

  // 3. Repeat
  while (true) {
    let result;
    // a. If test is not [empty], then
    if (test) {
      // i. Let testRef be the result of evaluating test.
      let testRef = env.evaluate(test, strictCode);

      // ii. Let testValue be ? GetValue(testRef).
      let testValue = Environment.GetValue(realm, testRef);

      // iii. If ToBoolean(testValue) is false, return NormalCompletion(V).
      if (!To.ToBooleanPartial(realm, testValue)) {
        result = Functions.incorporateSavedCompletion(realm, V);
        if (result instanceof JoinedNormalAndAbruptCompletions) {
          let selector = c => c instanceof BreakCompletion && !c.target;
          result = Completion.normalizeSelectedCompletions(selector, result);
          result = realm.composeWithSavedCompletion(result);
        }
        return V;
      }
    }

    // b. Let result be the result of evaluating stmt.
    result = env.evaluateCompletion(stmt, strictCode);
    invariant(result instanceof Value || result instanceof AbruptCompletion);

    // this is a join point for break and continue completions
    result = Functions.incorporateSavedCompletion(realm, result);
    invariant(result !== undefined);
    if (result instanceof Value) result = new SimpleNormalCompletion(result);

    // c. If LoopContinues(result, labelSet) is false, return Completion(UpdateEmpty(result, V)).
    if (!LoopContinues(realm, result, labelSet)) {
      invariant(result instanceof AbruptCompletion);
      // ECMA262 13.1.7
      if (result instanceof BreakCompletion) {
        if (!result.target) return (UpdateEmpty(realm, result, V): any).value;
      } else if (result instanceof JoinedAbruptCompletions) {
        let selector = c => c instanceof BreakCompletion && !c.target;
        if (result.containsSelectedCompletion(selector)) {
          result = Completion.normalizeSelectedCompletions(selector, result);
        }
      }
      return realm.returnOrThrowCompletion(result);
    }
    if (result instanceof JoinedNormalAndAbruptCompletions) {
      result = Completion.normalizeSelectedCompletions(c => c instanceof ContinueCompletion, result);
    }
    invariant(result instanceof Completion);
    result = realm.composeWithSavedCompletion(result);

    // d. If result.[[Value]] is not empty, let V be result.[[Value]].
    let resultValue = InternalGetResultValue(realm, result);
    if (!(resultValue instanceof EmptyValue)) V = resultValue;

    // e. Perform ? CreatePerIterationEnvironment(perIterationBindings).
    CreatePerIterationEnvironment(realm, perIterationBindings);
    env = realm.getRunningContext().lexicalEnvironment;

    // f. If increment is not [empty], then
    if (increment) {
      // i. Let incRef be the result of evaluating increment.
      let incRef = env.evaluate(increment, strictCode);

      // ii. Perform ? GetValue(incRef).
      Environment.GetValue(realm, incRef);
    } else if (realm.useAbstractInterpretation) {
      // If we have no increment and we've hit 6 iterations of trying to evaluate
      // this loop body, then see if we have a break, return or throw completion in a
      // guarded condition and fail if it does. We already have logic to guard
      // against loops that are actually infinite. However, because there may be so
      // many forked execution paths, and they're non linear, then it might
      // computationally lead to a something that seems like an infinite loop.
      possibleInfiniteLoopIterations++;
      if (possibleInfiniteLoopIterations > 6) {
        failIfContainsBreakOrReturnOrThrowCompletion(realm.savedCompletion);
      }
    }
  }
  invariant(false);

  function failIfContainsBreakOrReturnOrThrowCompletion(c: void | Completion | Value) {
    if (c === undefined) return;
    if (c instanceof ThrowCompletion || c instanceof BreakCompletion || c instanceof ReturnCompletion) {
      let diagnostic = new CompilerDiagnostic(
        "break, throw or return cannot be guarded by abstract condition",
        c.location,
        "PP0035",
        "FatalError"
      );
      realm.handleError(diagnostic);
      throw new FatalError();
    }
    if (c instanceof JoinedAbruptCompletions || c instanceof JoinedNormalAndAbruptCompletions) {
      failIfContainsBreakOrReturnOrThrowCompletion(c.consequent);
      failIfContainsBreakOrReturnOrThrowCompletion(c.alternate);
    }
  }
}

let BailOutWrapperClosureRefVisitor = {
  ReferencedIdentifier(path: BabelTraversePath, state: BailOutWrapperInfo) {
    if (path.node.name === "arguments") {
      state.usesArguments = true;
    }
  },
  ThisExpression(path: BabelTraversePath, state: BailOutWrapperInfo) {
    state.usesThis = true;
  },
  "BreakStatement|ContinueStatement"(path: BabelTraversePath, state: BailOutWrapperInfo) {
    if (path.node.label !== null) {
      state.usesGotoToLabel = true;
    }
  },
  ReturnStatement(path: BabelTraversePath, state: BailOutWrapperInfo) {
    state.usesReturn = true;
  },
  ThrowStatement(path: BabelTraversePath, state: BailOutWrapperInfo) {
    state.usesThrow = true;
  },
  VariableDeclaration(path: BabelTraversePath, state: BailOutWrapperInfo) {
    let node = path.node;

    // `let` and `const` are lexically scoped. We only need to change `var`s into assignments. Since we hoist the loop
    // into its own function `var`s (which are function scoped) need to be made available outside the loop.
    if (node.kind !== "var") return;

    if (t.isForOfStatement(path.parentPath.node) || t.isForInStatement(path.parentPath.node)) {
      // For-of and for-in variable declarations behave a bit differently. There is only one declarator and there is
      // never an initializer. Furthermore we can’t replace with an expression or statement, only a
      // `LeftHandSideExpression`. However, that `LeftHandSideExpression` will perform a `DestructuringAssignment`
      // operation which is what we want.

      invariant(node.declarations.length === 1);
      invariant(node.declarations[0].init == null);

      const { id } = node.declarations[0];

      if (!t.isIdentifier(id)) {
        // We do not currently support ObjectPattern, SpreadPattern and ArrayPattern
        // see: https://github.com/babel/babylon/blob/master/ast/spec.md#patterns
        state.varPatternUnsupported = true;
        return;
      }

      // Replace with the id directly since it is a `LeftHandSideExpression`.
      path.replaceWith(id);
    } else {
      // Change all variable declarations into assignment statements. We assign to capture variables made available
      // outside of this scope.

      // If our parent is a `for (var x; x < y; x++)` loop we do not need a wrapper.
      // i.e. for (var x of y) for (var x in y) for (var x; x < y; x++)
      let needsExpressionWrapper = !t.isForStatement(path.parentPath.node);

      const getConvertedDeclarator = index => {
        let { id, init } = node.declarations[index];

        if (t.isIdentifier(id)) {
          // If init is undefined, then we need to ensure we provide
          // an actual Babel undefined node for it.
          if (init === null) {
            init = t.identifier("undefined");
          }
          return t.assignmentExpression("=", id, init);
        } else {
          // We do not currently support ObjectPattern, SpreadPattern and ArrayPattern
          // see: https://github.com/babel/babylon/blob/master/ast/spec.md#patterns
          state.varPatternUnsupported = true;
        }
      };

      if (node.declarations.length === 1) {
        let convertedNodeOrUndefined = getConvertedDeclarator(0);
        if (convertedNodeOrUndefined === undefined) {
          // Do not continue as we don't support this
          return;
        }
        path.replaceWith(
          needsExpressionWrapper ? t.expressionStatement(convertedNodeOrUndefined) : convertedNodeOrUndefined
        );
      } else {
        // convert to sequence, so: `var x = 1, y = 2;` becomes `x = 1, y = 2;`
        let expressions = [];
        for (let i = 0; i < node.declarations.length; i++) {
          let convertedNodeOrUndefined = getConvertedDeclarator(i);
          if (convertedNodeOrUndefined === undefined) {
            // Do not continue as we don't support this
            return;
          }
          expressions.push(convertedNodeOrUndefined);
        }
        let sequenceExpression = t.sequenceExpression(((expressions: any): Array<BabelNodeExpression>));
        path.replaceWith(needsExpressionWrapper ? t.expressionStatement(sequenceExpression) : sequenceExpression);
      }
    }
  },
};

function generateRuntimeForStatement(
  ast: BabelNodeForStatement,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm,
  labelSet: ?Array<string>
): AbstractValue {
  let wrapperFunction = new ECMAScriptSourceFunctionValue(realm);
  let body = ((t.cloneDeep(t.blockStatement([ast])): any): BabelNodeBlockStatement);
  wrapperFunction.initialize([], body);
  wrapperFunction.$Environment = env;
  // We need to scan to AST looking for "this", "return", "throw", labels and "arguments"
  let functionInfo = {
    usesArguments: false,
    usesThis: false,
    usesReturn: false,
    usesGotoToLabel: false,
    usesThrow: false,
    varPatternUnsupported: false,
  };

  traverse(
    t.file(t.program([t.expressionStatement(t.functionExpression(null, [], body))])),
    BailOutWrapperClosureRefVisitor,
    null,
    functionInfo
  );
  traverse.cache.clear();
  let { usesReturn, usesThrow, usesArguments, usesGotoToLabel, varPatternUnsupported, usesThis } = functionInfo;

  if (usesReturn || usesThrow || usesArguments || usesGotoToLabel || varPatternUnsupported) {
    // We do not have support for these yet
    let diagnostic = new CompilerDiagnostic(
      `failed to recover from a for/while loop bail-out due to unsupported logic in loop body`,
      realm.currentLocation,
      "PP0037",
      "FatalError"
    );
    realm.handleError(diagnostic);
    throw new FatalError();
  }
  let args = [wrapperFunction];

  if (usesThis) {
    let thisRef = env.evaluate(t.thisExpression(), strictCode);
    let thisVal = Environment.GetValue(realm, thisRef);
    Leak.value(realm, thisVal);
    args.push(thisVal);
  }

  // We leak the wrapping function value, which in turn invokes the leak
  // logic which is transitive. The leaking logic should recursively visit
  // all bindings/objects in the loop and its body and mark the associated
  // bindings/objects as leaked
  Leak.value(realm, wrapperFunction);

  let wrapperValue = AbstractValue.createTemporalFromBuildFunction(
    realm,
    Value,
    args,
    createOperationDescriptor("FOR_STATEMENT_FUNC", { usesThis })
  );
  invariant(wrapperValue instanceof AbstractValue);
  return wrapperValue;
}

function tryToEvaluateForStatementOrLeaveAsAbstract(
  ast: BabelNodeForStatement,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm,
  labelSet: ?Array<string>
): Value {
  invariant(!realm.instantRender.enabled);
  let effects;
  let savedSuppressDiagnostics = realm.suppressDiagnostics;
  try {
    realm.suppressDiagnostics = true;
    effects = realm.evaluateForEffects(
      () => evaluateForStatement(ast, strictCode, env, realm, labelSet),
      undefined,
      "tryToEvaluateForStatementOrLeaveAsAbstract"
    );
  } catch (error) {
    if (error instanceof FatalError) {
      realm.suppressDiagnostics = savedSuppressDiagnostics;
      return realm.evaluateWithPossibleThrowCompletion(
        () => generateRuntimeForStatement(ast, strictCode, env, realm, labelSet),
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

// ECMA262 13.7.4.7
export default function(
  ast: BabelNodeForStatement,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm,
  labelSet: ?Array<string>
): Value {
  if (realm.isInPureScope() && !realm.instantRender.enabled) {
    return tryToEvaluateForStatementOrLeaveAsAbstract(ast, strictCode, env, realm, labelSet);
  } else {
    return evaluateForStatement(ast, strictCode, env, realm, labelSet);
  }
}

function evaluateForStatement(
  ast: BabelNodeForStatement,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm,
  labelSet: ?Array<string>
): Value {
  let { init, test, update, body } = ast;

  if (init && init.type === "VariableDeclaration") {
    if (init.kind === "var") {
      // for (var VariableDeclarationList; Expression; Expression) Statement
      // 1. Let varDcl be the result of evaluating VariableDeclarationList.
      let varDcl = env.evaluate(init, strictCode);

      // 2. ReturnIfAbrupt(varDcl).
      varDcl;

      // 3. Return ? ForBodyEvaluation(the first Expression, the second Expression, Statement, « », labelSet).
      return ForBodyEvaluation(realm, test, update, body, [], labelSet, strictCode);
    } else {
      // for (LexicalDeclaration Expression; Expression) Statement
      // 1. Let oldEnv be the running execution context's LexicalEnvironment.
      let oldEnv = env;

      // 2. Let loopEnv be NewDeclarativeEnvironment(oldEnv).
      let loopEnv = Environment.NewDeclarativeEnvironment(realm, oldEnv);

      // 3. Let loopEnvRec be loopEnv's EnvironmentRecord.
      let loopEnvRec = loopEnv.environmentRecord;

      // 4. Let isConst be the result of performing IsConstantDeclaration of LexicalDeclaration.
      let isConst = init.kind === "const";

      // 5. Let boundNames be the BoundNames of LexicalDeclaration.
      let boundNames = Environment.BoundNames(realm, init);

      // 6. For each element dn of boundNames do
      for (let dn of boundNames) {
        // a. If isConst is true, then
        if (isConst) {
          // i. Perform ! loopEnvRec.CreateImmutableBinding(dn, true).
          loopEnvRec.CreateImmutableBinding(dn, true);
        } else {
          // b. Else,
          // i. Perform ! loopEnvRec.CreateMutableBinding(dn, false).
          loopEnvRec.CreateMutableBinding(dn, false);
        }
      }

      // 7. Set the running execution context's LexicalEnvironment to loopEnv.
      realm.getRunningContext().lexicalEnvironment = loopEnv;

      // 8. Let forDcl be the result of evaluating LexicalDeclaration.
      let forDcl = loopEnv.evaluateCompletion(init, strictCode);

      // 9. If forDcl is an abrupt completion, then
      if (forDcl instanceof AbruptCompletion) {
        // a. Set the running execution context's LexicalEnvironment to oldEnv.
        let currentEnv = realm.getRunningContext().lexicalEnvironment;
        realm.onDestroyScope(currentEnv);
        if (currentEnv !== loopEnv) invariant(loopEnv.destroyed);
        realm.getRunningContext().lexicalEnvironment = oldEnv;

        // b. Return Completion(forDcl).
        throw forDcl;
      }

      // 10. If isConst is false, let perIterationLets be boundNames; otherwise let perIterationLets be « ».
      let perIterationLets = !isConst ? boundNames : [];

      let bodyResult;
      try {
        // 11. Let bodyResult be ForBodyEvaluation(the first Expression, the second Expression, Statement, perIterationLets, labelSet).
        bodyResult = ForBodyEvaluation(realm, test, update, body, perIterationLets, labelSet, strictCode);
      } finally {
        // 12. Set the running execution context's LexicalEnvironment to oldEnv.
        let currentEnv = realm.getRunningContext().lexicalEnvironment;
        realm.onDestroyScope(currentEnv);
        if (currentEnv !== loopEnv) invariant(loopEnv.destroyed);
        realm.getRunningContext().lexicalEnvironment = oldEnv;
      }
      // 13. Return Completion(bodyResult).
      return bodyResult;
    }
  } else {
    // for (Expression; Expression; Expression) Statement
    // 1. If the first Expression is present, then
    if (init) {
      // a. Let exprRef be the result of evaluating the first Expression.
      let exprRef = env.evaluate(init, strictCode);

      // b. Perform ? GetValue(exprRef).
      Environment.GetValue(realm, exprRef);
    }

    // 2. Return ? ForBodyEvaluation(the second Expression, the third Expression, Statement, « », labelSet).
    return ForBodyEvaluation(realm, test, update, body, [], labelSet, strictCode);
  }
}
