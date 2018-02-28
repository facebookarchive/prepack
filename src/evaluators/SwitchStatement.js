/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { Effects, Realm } from "../realm.js";
import type { LexicalEnvironment } from "../environment.js";
import { Reference } from "../environment.js";
import { AbruptCompletion, BreakCompletion, PossiblyNormalCompletion, Completion } from "../completions.js";
import { computeBinary } from "./BinaryExpression.js";
import { construct_empty_effects } from "../realm.js";
import { InternalGetResultValue } from "./ForOfStatement.js";
import { EmptyValue, AbstractValue, ConcreteValue, Value } from "../values/index.js";
import { StrictEqualityComparisonPartial, UpdateEmpty } from "../methods/index.js";
import { Environment, To, Path, Join } from "../singletons.js";
import { FatalError } from "../errors.js";
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

function GetValue(input: Value | Completion, defaultValue: Value, realm: Realm): Value | Completion {
  // extract the internal value
  let value;
  if (input instanceof Completion) {
    value = input.value;
  } else {
    value = input;
  }

  // if the value we got was not empty, let's use it as the new propagating value
  if (!(value instanceof EmptyValue)) {
    defaultValue = value;
  }

  return UpdateEmpty(realm, input, defaultValue);
}

function EvaluateCase(
  c: BabelNodeSwitchCase,
  env: LexicalEnvironment,
  realm: Realm,
  strictCode: boolean
): Value | AbruptCompletion {
  let r = realm.intrinsics.empty;
  for (let node of c.consequent) {
    let res = env.evaluateCompletion(node, strictCode);
    if (res instanceof AbruptCompletion) return (UpdateEmpty(realm, res, r): any);
    if (!(res instanceof EmptyValue)) r = res;
  }
  return r;
}

function AbstractCaseBlockEvaluation(
  cases: Array<BabelNodeSwitchCase>,
  defaultCaseIndex: number,
  input: Value,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): Value {
  let ReportNoReferenceError = () => {
    let msg = "This operation is not yet supported on case blocks that result in a Reference.";
    realm.reportIntrospectionError(msg);
    return new FatalError(msg);
  };

  let ReportNoPossiblyNormalCompletionError = () => {
    let msg = "This operation is not yet supported on case blocks that result in a PossiblyNormalCompletion.";
    realm.reportIntrospectionError(msg);
    return new FatalError(msg);
  };

  let ReportNoAbruptCompletionError = () => {
    let msg = "This operation is not yet supported on case blocks that result in an AbruptCompletino (by throwing).";
    realm.reportIntrospectionError(msg);
    return new FatalError(msg);
  };

  let DefiniteCaseEvaluation = (caseIndex: number): Value => {
    let result = realm.intrinsics.undefined;
    // we start at the case we've been asked to evaluate, and process statements
    // until there is either a break statement or exception thrown (this means we
    // implicitly fall through correctly in the absence of a break statement).
    while (caseIndex < cases.length && !(result instanceof Completion)) {
      let c = cases[caseIndex];
      for (let i = 0; i < c.consequent.length && !(result instanceof Completion); ++i) {
        let node = c.consequent[i];
        let r = env.evaluateCompletion(node, strictCode);

        // TODO understand Reference and how to deal with it better
        // TODO come up with a strategy for handling PossiblyNormalCompletion correctly
        if (r instanceof Reference) {
          throw ReportNoReferenceError();
        } else if (r instanceof PossiblyNormalCompletion) {
          throw ReportNoPossiblyNormalCompletionError();
        }

        result = GetValue(r, result, realm);
      }
      caseIndex++;
    }

    // TODO work out what to do with Reference
    if (result instanceof Reference) {
      throw ReportNoReferenceError();
    }

    if (result instanceof BreakCompletion) {
      return result.value;
    } else if (result instanceof AbruptCompletion) {
      throw ReportNoAbruptCompletionError();
    } else if (result instanceof Completion) {
      return result.value;
    } else {
      return result;
    }
  };

  let AbstractCaseEvaluation = (caseIndex: number, condition: AbstractValue): Effects => {
    return Path.withCondition(condition, () => {
      return realm.evaluateForEffects(() => {
        return DefiniteCaseEvaluation(caseIndex);
      });
    });
  };

  let ConstructPathCondition = (
    previousConditions: Array<AbstractValue>,
    currentCondition: AbstractValue
  ): AbstractValue => {
    let fullCondition = currentCondition;
    for (let previousCondition of previousConditions) {
      fullCondition = AbstractValue.createFromLogicalOp(realm, "&&", fullCondition, previousCondition);
    }

    invariant(fullCondition instanceof AbstractValue);
    return fullCondition;
  };

  // we remember the inverse of the condition for each path that is considered
  // these are used to refine the condition for the next path considered as well
  // as the condition under which the default path should be explored
  // an abstract view of all the possiblities
  let pathConditions: Array<AbstractValue> = [];
  // we join all the values and effects of paths that might be traversed so we get
  // an abstract view of all the possiblities
  let collectedEffects: Array<[Effects, AbstractValue]> = [];

  // iterate over each case block, beginning with the first.
  // evaluate the case selector and see if we can definitively take the case
  // if so, we are done.
  // if not, die.
  for (let i = 0; i < cases.length; ++i) {
    // only consider the default case once all other cases have been examined
    if (i === defaultCaseIndex) continue;

    let c = cases[i];
    let test = c.test;
    invariant(test);

    let selector = CaseSelectorEvaluation(test, strictCode, env, realm);
    let selectionResult = computeBinary(realm, "===", input, selector);

    // if we have a ConcreteValue let's use it to simplify the possibilities
    if (selectionResult instanceof ConcreteValue) {
      //  we have a winning result for the switch case
      // (so note we deliberately forget anything we evaluated earlier..it is now irrelevant)
      if (To.ToBoolean(realm, selectionResult)) {
        return DefiniteCaseEvaluation(i);
      } else {
        // we have a case that is definitively *not* taken - nothing more to do
      }
    } else {
      invariant(selectionResult instanceof AbstractValue);
      if (!selectionResult.mightBeFalse()) {
        //  we have a winning result for the switch case
        // (so note we deliberately forget anything we evaluated earlier..it is now irrelevant)
        return DefiniteCaseEvaluation(i);
      } else if (!selectionResult.mightBeTrue()) {
        // we have a case that is definitively *not* taken
        // we remember it's condition below so we can refine the path conditions
        // for cases that are subsequently examined
      } else {
        // we can't be sure whether the case selector evaluates true or not
        // so we evaluate the case in the abstract
        let pathCondition = ConstructPathCondition(pathConditions, selectionResult);
        let effects = AbstractCaseEvaluation(i, pathCondition);
        collectedEffects.push([effects, selectionResult]);
      }
      // whenever we have an abstract case, add the inverse of its selection result
      // to the set of path conditions used for further case evaluations
      pathConditions.push(AbstractValue.createFromBinaryOp(realm, "!==", input, selector));
    }
  }

  // if we've reached here it means we did not find a definite case
  // to select for execution. This means that - if there is a default case -
  // it may be possible for it to execute. So we add it to the abstract
  // evaluation.
  if (defaultCaseIndex !== -1) {
    if (pathConditions.length > 0) {
      let fullCondition = pathConditions.reduce((l, r) => {
        let accumulated = AbstractValue.createFromLogicalOp(realm, "&&", l, r);
        invariant(accumulated instanceof AbstractValue);
        return accumulated;
      });

      let effects = AbstractCaseEvaluation(defaultCaseIndex, fullCondition);
      collectedEffects.push([effects, fullCondition]);
    } else {
      return DefiniteCaseEvaluation(defaultCaseIndex);
    }
  }

  // we join the effects of abstract evaluation from most-recent back to
  // least-recent in order to get the serialized output to be logically
  // equivalent to the case statement's lexical order.
  let [finalEffects] = collectedEffects.reduceRight(
    (prev, next) => {
      let e = next[0];
      let c = next[1];
      finalEffects = Join.joinEffects(realm, c, e, prev[0]);
      return [finalEffects, c];
    },
    [construct_empty_effects(realm), undefined]
  );

  let result = finalEffects[0];

  // TODO restrict output of i/o effects here. Not quite sure how (?generators)
  // TODO work out what to do with Reference
  if (result instanceof Reference) {
    throw ReportNoReferenceError();
  }

  realm.applyEffects(finalEffects);

  if (result instanceof BreakCompletion) {
    return result.value;
  } else if (result instanceof AbruptCompletion) {
    throw result;
  } else if (result instanceof Completion) {
    return result.value;
  } else {
    return result;
  }
}

function CaseBlockEvaluation(
  cases: Array<BabelNodeSwitchCase>,
  input: Value,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): Value {
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
      if (found) {
        // b. If found is true, then
        // i. Let R be the result of evaluating C.
        let R = EvaluateCase(C, env, realm, strictCode);

        // ii. If R.[[Value]] is not empty, let V be R.[[Value]].
        let val = InternalGetResultValue(realm, R);
        if (!(val instanceof EmptyValue)) V = val;

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
  let default_case_num = cases.findIndex(clause => {
    return clause.test === null;
  });

  // Abstract interpretation of case blocks is a significantly different process
  // from regular interpretation, so we fork off early to keep things tidily separated.
  if (input instanceof AbstractValue) {
    return AbstractCaseBlockEvaluation(cases, default_case_num, input, strictCode, env, realm);
  }

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
    let R = EvaluateCase(cases[default_case_num], env, realm, strictCode);

    // 10. If R.[[Value]] is not empty, let V be R.[[Value]].
    let val = InternalGetResultValue(realm, R);
    if (!(val instanceof EmptyValue)) V = val;

    // 11. If R is an abrupt completion, return Completion(UpdateEmpty(R, V)).
    if (R instanceof AbruptCompletion) {
      throw UpdateEmpty(realm, R, V);
    }

    // 12: Repeat for each CaseClause C in B (NOTE this is another complete iteration of the second CaseClauses)
    for (let C of B) {
      // a. Let R be the result of evaluating CaseClause C.
      R = EvaluateCase(C, env, realm, strictCode);

      // b. If R.[[Value]] is not empty, let V be R.[[Value]].
      let value = InternalGetResultValue(realm, R);
      if (!(value instanceof EmptyValue)) V = value;

      // c. If R is an abrupt completion, return Completion(UpdateEmpty(R, V)).
      if (R instanceof AbruptCompletion) {
        throw UpdateEmpty(realm, R, V);
      }
    }

    // 13. Return NormalCompletion(V).
    return V;
  } else {
    // CaseBlock:{CaseClauses}
    let V;
    [, V] = EvaluateCaseClauses(cases, realm.intrinsics.undefined);
    return V;
  }
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
