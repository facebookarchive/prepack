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
import { FatalError } from "../errors.js";
import { Value } from "../values/index.js";
import { EmptyValue } from "../values/index.js";
import { UpdateEmpty } from "../methods/index.js";
import { LoopContinues, InternalGetResultValue, TryToApplyEffectsOfJoiningBranches } from "./ForOfStatement.js";
import { AbruptCompletion, BreakCompletion, JoinedAbruptCompletions } from "../completions.js";
import { Environment, To } from "../singletons.js";
import invariant from "../invariant.js";
import type { BabelNodeDoWhileStatement } from "babel-types";

export default function(
  ast: BabelNodeDoWhileStatement,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm,
  labelSet: ?Array<string>
): Value {
  let { body, test } = ast;

  // 1. Let V be undefined.
  let V = realm.intrinsics.undefined;

  // 2. Repeat
  let resultOrDiagnostic = realm.evaluateWithUndoForDiagnostic(() => {
    while (true) {
      // a. Let stmt be the result of evaluating Statement.
      let stmt = env.evaluateCompletion(body, strictCode);
      //todo: check if stmt is a PossiblyNormalCompletion and defer to fixpoint computation below
      invariant(stmt instanceof Value || stmt instanceof AbruptCompletion);
      if (stmt instanceof JoinedAbruptCompletions) stmt = TryToApplyEffectsOfJoiningBranches(realm, stmt);

      // b. If LoopContinues(stmt, labelSet) is false, return Completion(UpdateEmpty(stmt, V)).
      if (LoopContinues(realm, stmt, labelSet) === false) {
        invariant(stmt instanceof AbruptCompletion);
        // ECMA262 13.1.7
        if (stmt instanceof BreakCompletion) {
          if (!stmt.target) return (UpdateEmpty(realm, stmt, V): any).value;
        }
        throw UpdateEmpty(realm, stmt, V);
      }

      // c. If stmt.[[Value]] is not empty, let V be stmt.[[Value]].
      let resultValue = InternalGetResultValue(realm, stmt);
      if (!(resultValue instanceof EmptyValue)) V = resultValue;

      // d. Let exprRef be the result of evaluating Expression.
      let exprRef = env.evaluate(test, strictCode);

      // e. Let exprValue be ? GetValue(exprRef).
      let exprValue = Environment.GetConditionValue(realm, exprRef);

      // f. If ToBoolean(exprValue) is false, return NormalCompletion(V).
      if (To.ToBooleanPartial(realm, exprValue) === false) return V;
    }
    invariant(false);
  });
  if (resultOrDiagnostic instanceof Value) return resultOrDiagnostic;

  // If we get here then unrolling the loop did not work, possibly because the value of the loop condition is not known,
  // so instead try to compute a fixpoint for it
  let iteration = () => {
    let bodyResult = env.evaluateCompletion(body, strictCode);
    let exprRef = env.evaluate(test, strictCode);
    let testResult = Environment.GetConditionValue(realm, exprRef);
    return [testResult, bodyResult];
  };
  let result = realm.evaluateForFixpointEffects(iteration);
  if (result !== undefined) {
    let [outsideEffects, insideEffects, cond] = result;
    let rval = outsideEffects.result;
    let bodyGenerator = insideEffects.generator;
    realm.applyEffects(outsideEffects);
    let generator = realm.generator;
    invariant(generator !== undefined);
    generator.emitDoWhileStatement(cond, bodyGenerator);
    invariant(rval instanceof Value, "todo: handle loops that throw exceptions or return");
    return rval;
  }

  // If we get here the fixpoint computation failed as well. Report the diagnostic from the unrolling and throw.
  realm.handleError(resultOrDiagnostic);
  throw new FatalError();
}
