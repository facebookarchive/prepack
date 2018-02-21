/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { Realm, Effects } from "../realm.js";
import { construct_empty_effects } from "../realm.js";
import { LexicalEnvironment } from "../environment.js";
import { AbruptCompletion, BreakCompletion, PossiblyNormalCompletion } from "../completions.js";
import { InternalGetResultValue } from "./ForOfStatement.js";
import { computeBinary } from "./BinaryExpression";
import { AbstractValue, ConcreteValue, EmptyValue, Value } from "../values/index.js";
import { UpdateEmpty } from "../methods/index.js";
import { Environment, Join, Path, To } from "../singletons.js";
import type { BabelNodeSwitchStatement, BabelNodeSwitchCase, BabelNodeExpression } from "babel-types";
import invariant from "../invariant.js";

// 13.12.10 Runtime Semantics: CaseSelectorEvaluation
function CaseSelectorEvaluation(
  expression: BabelNodeExpression,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): Value {
  // 1. Let exprRef be the result of evaluating Expression.
  let exprRef = env.evaluate(expression, strictCode);

  // 2. Return ? GetValue(exprRef).
  return Environment.GetValue(realm, exprRef);
}

function CaseBlockEvaluation(
  cases: Array<BabelNodeSwitchCase>,
  input: Value,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): Value {
  let EvaluateCase = (a: Array<BabelNodeSwitchCase>, idx: number): Value | AbruptCompletion => {
    let r = realm.intrinsics.empty;
    // we start at the case we've been asked to evaluate, but if there is no break statement,
    // then we fallthrough and process the next one and so on (they are stored in lexical order)
    while (idx < a.length && !(r instanceof BreakCompletion)) {
      let c = a[idx];
      for (let node of c.consequent) {
        let res = env.evaluateCompletionDeref(node, strictCode);
        if (res instanceof AbruptCompletion) return (UpdateEmpty(realm, res, r): any);
        if (!(res instanceof EmptyValue)) r = res;
      }
      idx++;
    }
    return r;
  };

  let EvaluateCaseForEffects = (a: Array<BabelNodeSwitchCase>, idx: number): Effects => {
    return realm.evaluateForEffects(() => {
      let r = realm.intrinsics.empty;
      // we start at the case we've been asked to evaluate, but if there is no break statement,
      // then we fallthrough and process the next one and so on (they are stored in lexical order)
      while (idx < a.length && !(r instanceof BreakCompletion)) {
        let c = a[idx];
        for (let node of c.consequent) {
          let res = env.evaluateCompletionDeref(node, strictCode);
          if (res instanceof AbruptCompletion) return (UpdateEmpty(realm, res, r): any);
          if (!(res instanceof EmptyValue)) r = res;
        }
        idx++;
      }
      return r;
    });
  };

  let EvaluateCaseAbstract = (a: Array<BabelNodeSwitchCase>, idx: number, condValue: AbstractValue): Effects => {
    return Path.withCondition(condValue, () => {
      return EvaluateCaseForEffects(a, idx);
    });
  };

  let EvaluateCaseClauses = (A: Array<BabelNodeSwitchCase>, V: Value): Value => {
    let defaultIndex = A.findIndex(c => c.test === null);

    let possibleCases: Array<[number, AbstractValue]> = [];
    for (let i = 0; i < A.length; ++i) {
      // we only consider the default case once all other cases have been examined
      if (i === defaultIndex) continue;

      let C = A[i];

      let test = C.test;
      invariant(test);
      let clauseSelector = CaseSelectorEvaluation(test, strictCode, env, realm);
      let selectionResult = computeBinary(realm, "===", input, clauseSelector);

      // if we have a ConcreteValue as the result of the comparison, then we have a winning result for the switch case
      if (selectionResult instanceof ConcreteValue) {
        if (To.ToBoolean(realm, selectionResult)) {
          // Let R be the result of evaluating C.
          let R = EvaluateCase(A, i);

          // If R.[[Value]] is not empty, let V be R.[[Value]].
          let val = InternalGetResultValue(realm, R);
          if (!(val instanceof EmptyValue)) V = val;

          // If R is an abrupt completion, return Completion(UpdateEmpty(R, V)).
          if (R instanceof AbruptCompletion) {
            throw UpdateEmpty(realm, R, V);
          }

          return V;
        }
      } else {
        invariant(selectionResult instanceof AbstractValue);

        // remember a case that resulted in an AbstractValue in case
        // we can find none that result in a ConcreteValue.
        // In that event, we will have to work in the abstract.
        possibleCases.push([i, selectionResult]);
      }
    }

    if (realm.useAbstractInterpretation) {
      // do abstract interpretation
      let effects = construct_empty_effects(realm);
      for (let [idx, selectionResult] of possibleCases) {
        let caseEffects = EvaluateCaseAbstract(A, idx, selectionResult);
        effects = Join.joinEffects(realm, selectionResult, effects, caseEffects);
      }

      let completion = effects[0];
      if (completion instanceof PossiblyNormalCompletion) {
        // in this case one of the branches may complete abruptly, which means that
        // not all control flow branches join into one flow at this point.
        // Consequently we have to continue tracking changes until the point where
        // all the branches come together into one.
        completion = realm.composeWithSavedCompletion(completion);
      }
      // Note that the effects of (non joining) abrupt branches are not included
      // in joinedEffects, but are tracked separately inside completion.
      realm.applyEffects(effects);

      // return or throw completion
      if (completion instanceof AbruptCompletion) throw completion;
      invariant(completion instanceof Value);
      V = completion;
    } else {
      invariant(possibleCases.length === 0);
      if (defaultIndex !== -1) {
        let defaultRes = EvaluateCase(A, defaultIndex);
        let val = InternalGetResultValue(realm, defaultRes);
        if (!(val instanceof EmptyValue)) V = val;

        // If R is an abrupt completion, return Completion(UpdateEmpty(R, V)).
        if (defaultRes instanceof AbruptCompletion) {
          throw UpdateEmpty(realm, defaultRes, V);
        }
        return V;
      }
    }
    return V;
  };

  // CaseBlock:{}
  // 1. Return NormalCompletion(undefined).
  if (cases.length === 0) return realm.intrinsics.undefined;

  let V = EvaluateCaseClauses(cases, realm.intrinsics.undefined);
  return V;
}

// 13.12.11
export default function(
  ast: BabelNodeSwitchStatement,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm,
  labelSet: Array<string>
): Value {
  let expression = ast.discriminant;
  let cases: Array<BabelNodeSwitchCase> = ast.cases;

  // 1. Let exprRef be the result of evaluating Expression.
  let exprRef = env.evaluate(expression, strictCode);

  // 2. Let switchValue be ? GetValue(exprRef).
  let switchValue = Environment.GetValue(realm, exprRef);

  // 3. Let oldEnv be the running execution context's LexicalEnvironment.
  let oldEnv = realm.getRunningContext().lexicalEnvironment;

  // 4. Let blockEnv be NewDeclarativeEnvironment(oldEnv).
  let blockEnv = Environment.NewDeclarativeEnvironment(realm, oldEnv);

  // 5. Perform BlockDeclarationInstantiation(CaseBlock, blockEnv).
  let CaseBlock = cases.map(c => c.consequent).reduce((stmts, case_blk) => stmts.concat(case_blk), []);
  Environment.BlockDeclarationInstantiation(realm, strictCode, CaseBlock, blockEnv);

  // 6. Set the running execution context's LexicalEnvironment to blockEnv.
  realm.getRunningContext().lexicalEnvironment = blockEnv;

  let R;
  try {
    // 7. Let R be the result of performing CaseBlockEvaluation of CaseBlock with argument switchValue.
    R = CaseBlockEvaluation(cases, switchValue, strictCode, blockEnv, realm);

    // 9. Return R.
    return R;
  } catch (e) {
    if (e instanceof BreakCompletion) {
      if (!e.target) return (UpdateEmpty(realm, e, realm.intrinsics.undefined): any).value;
    }
    throw e;
  } finally {
    // 8. Set the running execution context's LexicalEnvironment to oldEnv.
    realm.getRunningContext().lexicalEnvironment = oldEnv;
    realm.onDestroyScope(blockEnv);
  }
}
