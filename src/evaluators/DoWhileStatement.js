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
import { Value } from "../values/index.js";
import { EmptyValue } from "../values/index.js";
import { ToBooleanPartial, GetValue, UpdateEmpty } from "../methods/index.js";
import { LoopContinues, InternalGetResultValue } from "./ForOfStatement.js";
import { AbruptCompletion, BreakCompletion } from "../completions.js";
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
  while (true) {
    // a. Let stmt be the result of evaluating Statement.
    let stmt = env.evaluateCompletion(body, strictCode);
    invariant(stmt instanceof Value || stmt instanceof AbruptCompletion);

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
    let exprValue = GetValue(realm, exprRef);

    // f. If ToBoolean(exprValue) is false, return NormalCompletion(V).
    if (ToBooleanPartial(realm, exprValue) === false) return V;
  }

  invariant(false);
}
