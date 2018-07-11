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
import type { Realm } from "../realm.js";
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
  ForkedAbruptCompletion,
  PossiblyNormalCompletion,
  ReturnCompletion,
  SimpleNormalCompletion,
  ThrowCompletion,
} from "../completions.js";
import traverse from "babel-traverse";
import type { BabelTraversePath } from "babel-traverse";
import { TypesDomain, ValuesDomain } from "../domains/index.js";
import { CompilerDiagnostic, FatalError } from "../errors.js";
import { UpdateEmpty } from "../methods/index.js";
import { LoopContinues, InternalGetResultValue, TryToApplyEffectsOfJoiningBranches } from "./ForOfStatement.js";
import { Environment, Functions, Havoc, Join, To } from "../singletons.js";
import invariant from "../invariant.js";
import * as t from "babel-types";
import type { FunctionBodyAstNode } from "../types.js";
import type { BabelNodeExpression, BabelNodeForStatement, BabelNodeBlockStatement } from "babel-types";

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

  // 3. Repeat
  while (true) {
    // a. If test is not [empty], then
    if (test) {
      // i. Let testRef be the result of evaluating test.
      let testRef = env.evaluate(test, strictCode);

      // ii. Let testValue be ? GetValue(testRef).
      let testValue = Environment.GetValue(realm, testRef);

      // iii. If ToBoolean(testValue) is false, return NormalCompletion(V).
      if (!To.ToBooleanPartial(realm, testValue)) {
        // joinAllLoopExits does not handle labeled break/continue, so only use it when doing AI
        if (realm.useAbstractInterpretation) return joinAllLoopExits(V);
        return V;
      }
    }

    // b. Let result be the result of evaluating stmt.
    let result = env.evaluateCompletion(stmt, strictCode);
    invariant(result instanceof Value || result instanceof AbruptCompletion);
    if (result instanceof ForkedAbruptCompletion) result = TryToApplyEffectsOfJoiningBranches(realm, result);

    // c. If LoopContinues(result, labelSet) is false, return Completion(UpdateEmpty(result, V)).
    if (!LoopContinues(realm, result, labelSet)) {
      invariant(result instanceof AbruptCompletion);
      // joinAllLoopExits does not handle labeled break/continue, so only use it when doing AI
      if (realm.useAbstractInterpretation) {
        result = UpdateEmpty(realm, result, V);
        invariant(result instanceof AbruptCompletion);
        return joinAllLoopExits(result);
      }
      // ECMA262 13.1.7
      if (result instanceof BreakCompletion) {
        if (!result.target) return (UpdateEmpty(realm, result, V): any).value;
      }
      throw UpdateEmpty(realm, result, V);
    } else if (realm.useAbstractInterpretation) {
      // This is a join point for conditional continue completions lurking in realm.savedCompletion
      if (containsContinueCompletion(realm.savedCompletion)) {
        result = joinAllLoopContinues(result);
      }
    }

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
    }
  }
  invariant(false);

  function failIfContainsBreakOrContinueCompletionWithNonLocalTarget(c: void | Completion | Value) {
    if (c === undefined) return;
    if (c instanceof ContinueCompletion || c instanceof BreakCompletion) {
      if (!c.target) return;
      if (labelSet && labelSet.indexOf(c.target) >= 0) {
        c.target = null;
        return;
      }
      let diagnostic = new CompilerDiagnostic(
        "break or continue with target cannot be guarded by abstract condition",
        c.location,
        "PP0034",
        "FatalError"
      );
      realm.handleError(diagnostic);
      throw new FatalError();
    }
    if (c instanceof PossiblyNormalCompletion || c instanceof ForkedAbruptCompletion) {
      failIfContainsBreakOrContinueCompletionWithNonLocalTarget(c.consequent);
      failIfContainsBreakOrContinueCompletionWithNonLocalTarget(c.alternate);
    }
  }

  function containsContinueCompletion(c: void | Completion | Value) {
    if (c === undefined) return false;
    if (c instanceof ContinueCompletion) {
      if (!c.target) return true;
      if (labelSet && labelSet.indexOf(c.target) >= 0) {
        c.target = null;
        return true;
      }
      return false;
    }
    if (c instanceof PossiblyNormalCompletion || c instanceof ForkedAbruptCompletion)
      return containsContinueCompletion(c.consequent) || containsContinueCompletion(c.alternate);
    return false;
  }

  function joinAllLoopContinues(
    valueOrCompletionAtLoopContinuePoint: Value | AbruptCompletion
  ): Value | AbruptCompletion {
    // We are about start the next loop iteration and this presents a join point where all non loop breaking abrupt
    // control flows converge into a single flow using their joined effects as the new state.
    failIfContainsBreakOrContinueCompletionWithNonLocalTarget(realm.savedCompletion);

    // Incorporate the savedCompletion (we should only get called if there is one).
    invariant(realm.savedCompletion !== undefined);
    if (valueOrCompletionAtLoopContinuePoint instanceof Value)
      valueOrCompletionAtLoopContinuePoint = new ContinueCompletion(valueOrCompletionAtLoopContinuePoint, undefined);
    let abruptCompletion = Functions.incorporateSavedCompletion(realm, valueOrCompletionAtLoopContinuePoint);
    invariant(abruptCompletion instanceof AbruptCompletion);

    // If there is now a single completion, we don't need to join
    if (!(abruptCompletion instanceof ForkedAbruptCompletion)) return abruptCompletion;
    invariant(containsContinueCompletion(abruptCompletion));

    // Apply the joined effects of continue completions to the current state since these now join the normal path
    let joinedContinueEffects = Join.extractAndJoinCompletionsOfType(ContinueCompletion, realm, abruptCompletion);
    realm.applyEffects(joinedContinueEffects);
    let c = joinedContinueEffects.result;
    invariant(c instanceof ContinueCompletion);

    // We now make a PossiblyNormalCompletion out of abruptCompletion.
    // extractAndJoinCompletionsOfType helped with this by cheating and turning all of its nested completions
    // that contain continue completions into PossiblyNormalCompletions.
    let remainingCompletions = abruptCompletion.transferChildrenToPossiblyNormalCompletion();

    // At this stage there can still be other kinds of abrupt completions left inside abruptCompletion. If not just return.
    let stillAbrupt =
      remainingCompletions.containsCompletion(BreakCompletion) ||
      remainingCompletions.containsCompletion(ReturnCompletion) ||
      remainingCompletions.containsCompletion(ThrowCompletion);
    if (!stillAbrupt) return c;

    // Stash the remaining completions in the realm start tracking the effects that need to be appended
    // to the normal branch at the next join point.
    realm.savedCompletion = remainingCompletions;
    realm.captureEffects(remainingCompletions); // so that we can join the normal path wtih them later on
    return c;
  }

  function joinAllLoopExits(valueOrCompletionAtUnconditionalExit: Value | AbruptCompletion): Value {
    // We are about the leave this loop and this presents a join point where all loop breaking control flows
    // converge into a single flow using their joined effects as the new state.
    failIfContainsBreakOrContinueCompletionWithNonLocalTarget(realm.savedCompletion);

    // Incorporate the savedCompletion if there is one.
    if (valueOrCompletionAtUnconditionalExit instanceof Value)
      valueOrCompletionAtUnconditionalExit = new BreakCompletion(valueOrCompletionAtUnconditionalExit, undefined);
    let abruptCompletion = Functions.incorporateSavedCompletion(realm, valueOrCompletionAtUnconditionalExit);
    invariant(abruptCompletion instanceof AbruptCompletion);

    // If there is now a single completion, we don't need to join
    if (abruptCompletion instanceof BreakCompletion) return (UpdateEmpty(realm, abruptCompletion, V): any).value;
    if (!(abruptCompletion instanceof ForkedAbruptCompletion)) throw abruptCompletion;

    // If there are no breaks, we don't need to join
    if (!abruptCompletion.containsCompletion(BreakCompletion)) throw abruptCompletion;

    // Apply the joined effects of break completions to the current state since these now join the normal path
    let joinedBreakEffects = Join.extractAndJoinCompletionsOfType(BreakCompletion, realm, abruptCompletion);
    realm.applyEffects(joinedBreakEffects);
    let c = joinedBreakEffects.result;
    invariant(c instanceof BreakCompletion);

    // We now make a PossiblyNormalCompletion out of abruptCompletion.
    // extractAndJoinCompletionsOfType helped with this by cheating and turning all of its nested completions
    // that contain continue completions into PossiblyNormalCompletions.
    let remainingCompletions = abruptCompletion.transferChildrenToPossiblyNormalCompletion();

    // At this stage there can still be other kinds of abrupt completions left inside abruptCompletion. If not just return.
    let stillAbrupt =
      remainingCompletions.containsCompletion(ReturnCompletion) ||
      remainingCompletions.containsCompletion(ThrowCompletion);
    if (!stillAbrupt) return (UpdateEmpty(realm, c, V): any).value;

    // Stash the remaining completions in the realm start tracking the effects that need to be appended
    // to the normal branch at the next join point.
    realm.savedCompletion = remainingCompletions;
    realm.captureEffects(remainingCompletions); // so that we can join the normal path wtih them later on

    // ECMA262 13.1.7
    return (UpdateEmpty(realm, c, V): any).value;
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
    // If our parent is a for loop (there are 3 kinds) we do not need a wrapper
    // i.e. for (var x of y) for (var x in y) for (var x; x < y; x++)
    let needsExpressionWrapper =
      !t.isForStatement(path.parentPath.node) &&
      !t.isForOfStatement(path.parentPath.node) &&
      !t.isForInStatement(path.parentPath.node);

    const getConvertedDeclarator = index => {
      let { id, init } = node.declarations[index];

      if (t.isIdentifier(id)) {
        return t.assignmentExpression("=", id, init);
      } else {
        // We do not currently support ObjectPattern, SpreadPattern and ArrayPattern
        // see: https://github.com/babel/babylon/blob/master/ast/spec.md#patterns
        state.varPatternUnsupported = true;
      }
    };

    if (node.kind === "var") {
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
  ((body: any): FunctionBodyAstNode).uniqueOrderedTag = realm.functionBodyUniqueTagSeed++;
  wrapperFunction.$ECMAScriptCode = body;
  wrapperFunction.$FormalParameters = [];
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
  traverse.clearCache();
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
    Havoc.value(realm, thisVal);
    args.push(thisVal);
  }

  // We havoc the wrapping function value, which in turn invokes the havocing
  // logic which is transitive. The havocing logic should recursively visit
  // all bindings/objects in the loop and its body and mark the associated
  // bindings/objects that do havoc appropiately.
  Havoc.value(realm, wrapperFunction);

  let wrapperValue = AbstractValue.createTemporalFromBuildFunction(
    realm,
    Value,
    args,
    ([func, thisExpr]) =>
      usesThis
        ? t.callExpression(t.memberExpression(func, t.identifier("call")), [thisExpr])
        : t.callExpression(func, [])
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
  if (completion instanceof SimpleNormalCompletion) completion = completion.value;
  invariant(completion instanceof Value);
  return completion;
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
