/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { Realm } from "../realm.js";
import type { LexicalEnvironment } from "../environment.js";
import type { Reference } from "../environment.js";
import { AbruptCompletion } from "../completions.js";
import { InternalGetResultValue } from "./ForOfStatement.js";
import { EmptyValue, Value } from "../values/index.js";
import {
  GetValue,
  NewDeclarativeEnvironment,
  BlockDeclarationInstantiation,
  StrictEqualityComparisonPartial,
  UpdateEmpty,
} from "../methods/index.js";
import type { BabelNodeSwitchStatement, BabelNodeSwitchCase, BabelNodeExpression } from "babel-types";
import invariant from "../invariant.js";

// 13.12.10 Runtime Semantics: CaseSelectorEvaluation
function CaseSelectorEvaluation(expression: BabelNodeExpression, strictCode: boolean, env: LexicalEnvironment, realm: Realm): Value {
  // 1. Let exprRef be the result of evaluating Expression.
  let exprRef = env.evaluate(expression, strictCode);

  // 2. Return ? GetValue(exprRef).
  return GetValue(realm, exprRef);
}

function CaseBlockEvaluation(cases: Array<BabelNodeSwitchCase>, input: Value, strictCode: boolean, env: LexicalEnvironment, realm: Realm): Reference | Value {

  let EvaluateCase = (c: BabelNodeSwitchCase): Reference | Value | AbruptCompletion => {
    let r = realm.intrinsics.undefined;
    for (let node of c.consequent) {
      let res = env.evaluateCompletion(node, strictCode);
      if (!(res instanceof EmptyValue)) r = res;
    }
    return r;
  };

  let EvaluateCaseClauses = (A: Array<BabelNodeSwitchCase>, V: Value): [boolean, Value] => {
    // 2. Let A be the List of CaseClause items in CaseClauses, in source text order.
    // A is passed in

    // 3. Let found be false.
    let found = false;

    // 4. Repeat for each CaseClause C in A,
    for (let C of A) {
      // a. If found is false, then
      if (!found) {
        // i. Let clauseSelector be the result of CaseSelectorEvaluation of C.
        let test = C.test;
        invariant(test);
        let clauseSelector = CaseSelectorEvaluation(test, strictCode, env, realm);

        // ii. ReturnIfAbrupt(clauseSelector).
        // above will throw a Completion which will return

        // iii. Let found be the result of performing Strict Equality Comparison input === clauseSelector.[[Value]].
        found = StrictEqualityComparisonPartial(realm, input, clauseSelector);
      }
      if (found) { // b. If found is true, then
        // i. Let R be the result of evaluating C.
        let R = EvaluateCase(C);

        // ii. If R.[[Value]] is not empty, let V be R.[[Value]].
        V = InternalGetResultValue(realm, R);

        // iii. If R is an abrupt completion, return Completion(UpdateEmpty(R, V)).
        if (R instanceof AbruptCompletion) {
          throw UpdateEmpty(realm, R, V);
        }
      }
    }
    return [found, V];
  };

  // CaseBlock:{}
  // 1. Return NormalCompletion(undefined).
  if (cases.length === 0) return realm.intrinsics.undefined;

  // CaseBlock:{CaseClauses DefaultClause CaseClauses}
  let default_case_num = cases.findIndex((clause) => {
    return clause.test === null;
  });

  if (default_case_num !== -1) {
    // 2. Let A be the List of CaseClause items in the first CaseClauses, in source text order. If the first CaseClauses is not present, A is « ».
    let A = cases.slice(0, default_case_num);

    let V = realm.intrinsics.undefined;

    // 4. Repeat for each CaseClause C in A
    [, V] = EvaluateCaseClauses(A, V);

    // 5. Let foundInB be false.
    let foundInB = false;

    // 6. Let B be the List containing the CaseClause items in the second CaseClauses, in source text order. If the second CaseClauses is not present, B is « ».
    let B = cases.slice(default_case_num + 1);

    [foundInB, V] = EvaluateCaseClauses(B, V);

    // 8. If foundInB is true, return NormalCompletion(V).
    if (foundInB) return V;

    // 9. Let R be the result of evaluating DefaultClause.
    let R = EvaluateCase(cases[default_case_num]);

    // 10. If R.[[Value]] is not empty, let V be R.[[Value]].
    V = InternalGetResultValue(realm, R);

    // 11. If R is an abrupt completion, return Completion(UpdateEmpty(R, V)).
    if (R instanceof AbruptCompletion) {
      throw UpdateEmpty(realm, R, V);
    }

    // 12: Repeat for each CaseClause C in B (NOTE this is another complete iteration of the second CaseClauses)
    for (let C of B) {
      // a. Let R be the result of evaluating CaseClause C.
      R = EvaluateCase(C);

      // b. If R.[[Value]] is not empty, let V be R.[[Value]].
      V = InternalGetResultValue(realm, R);

      // c. If R is an abrupt completion, return Completion(UpdateEmpty(R, V)).
      if (R instanceof AbruptCompletion) {
        throw UpdateEmpty(realm, R, V);
      }
    }

    // 13. Return NormalCompletion(V).
    return V;
  } else { // CaseBlock:{CaseClauses}
    let V;
    [, V] = EvaluateCaseClauses(cases, realm.intrinsics.undefined);
    return V;
  }
}

// 13.12.11
export default function (ast: BabelNodeSwitchStatement, strictCode: boolean, env: LexicalEnvironment, realm: Realm, labelSet: Array<string>): Value | Reference {
  let expression = ast.discriminant;
  let cases : Array<BabelNodeSwitchCase> = ast.cases;

  // 1. Let exprRef be the result of evaluating Expression.
  let exprRef = env.evaluate(expression, strictCode);

  // 2. Let switchValue be ? GetValue(exprRef).
  let switchValue = GetValue(realm, exprRef);

  // 3. Let oldEnv be the running execution context's LexicalEnvironment.
  let oldEnv = realm.getRunningContext().lexicalEnvironment;

  // 4. Let blockEnv be NewDeclarativeEnvironment(oldEnv).
  let blockEnv = NewDeclarativeEnvironment(realm, oldEnv);

  // 5. Perform BlockDeclarationInstantiation(CaseBlock, blockEnv).
  let CaseBlock = cases.map(c => c.consequent).reduce(
    (stmts, case_blk) => stmts.concat(case_blk), []);
  BlockDeclarationInstantiation(realm, strictCode, CaseBlock, blockEnv);

  // 6. Set the running execution context's LexicalEnvironment to blockEnv.
  realm.getRunningContext().lexicalEnvironment = blockEnv;

  let R;
  try {
    // 7. Let R be the result of performing CaseBlockEvaluation of CaseBlock with argument switchValue.
    R = CaseBlockEvaluation(cases, switchValue, strictCode, blockEnv, realm);

    // 9. Return R.
    return R;
  } finally {
    // 8. Set the running execution context's LexicalEnvironment to oldEnv.
    realm.getRunningContext().lexicalEnvironment = oldEnv;
  }
}
