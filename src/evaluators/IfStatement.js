/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import { AbruptCompletion } from "../completions.js";
import type { Realm } from "../realm.js";
import { construct_empty_effects } from "../realm.js";
import type { LexicalEnvironment } from "../environment.js";
import { AbstractValue, ConcreteValue, Value } from "../values/index.js";
import { Reference } from "../environment.js";
import { UpdateEmpty } from "../methods/index.js";
import type { BabelNodeIfStatement } from "@babel/types";
import invariant from "../invariant.js";
import { Environment, To } from "../singletons.js";

export function evaluate(ast: BabelNodeIfStatement, strictCode: boolean, env: LexicalEnvironment, realm: Realm): Value {
  // 1. Let exprRef be the result of evaluating Expression
  let exprRef = env.evaluate(ast.test, strictCode);
  // 2. Let exprValue be ToBoolean(? GetValue(exprRef))
  let exprValue: Value = Environment.GetConditionValue(realm, exprRef);

  if (exprValue instanceof ConcreteValue) {
    let stmtCompletion;
    if (To.ToBoolean(realm, exprValue)) {
      // 3.a. Let stmtCompletion be the result of evaluating the first Statement
      stmtCompletion = env.evaluateCompletion(ast.consequent, strictCode);
    } else {
      if (ast.alternate) {
        // 4.a. Let stmtCompletion be the result of evaluating the second Statement
        stmtCompletion = env.evaluateCompletion(ast.alternate, strictCode);
      } else {
        // 3 (of the if only statement). Return NormalCompletion(undefined)
        stmtCompletion = realm.intrinsics.undefined;
      }
    }
    // 5. Return Completion(UpdateEmpty(stmtCompletion, undefined)
    //if (stmtCompletion instanceof Reference) return stmtCompletion;
    invariant(!(stmtCompletion instanceof Reference));
    stmtCompletion = UpdateEmpty(realm, stmtCompletion, realm.intrinsics.undefined);
    if (stmtCompletion instanceof AbruptCompletion) {
      throw stmtCompletion;
    }
    invariant(stmtCompletion instanceof Value);
    return stmtCompletion;
  }
  invariant(exprValue instanceof AbstractValue);

  if (!exprValue.mightNotBeTrue()) {
    let stmtCompletion = env.evaluate(ast.consequent, strictCode);
    invariant(!(stmtCompletion instanceof Reference));
    stmtCompletion = UpdateEmpty(realm, stmtCompletion, realm.intrinsics.undefined);
    if (stmtCompletion instanceof AbruptCompletion) {
      throw stmtCompletion;
    }
    invariant(stmtCompletion instanceof Value);
    return stmtCompletion;
  } else if (!exprValue.mightNotBeFalse()) {
    let stmtCompletion;
    if (ast.alternate) stmtCompletion = env.evaluate(ast.alternate, strictCode);
    else stmtCompletion = realm.intrinsics.undefined;
    invariant(!(stmtCompletion instanceof Reference));
    stmtCompletion = UpdateEmpty(realm, stmtCompletion, realm.intrinsics.undefined);
    if (stmtCompletion instanceof AbruptCompletion) {
      throw stmtCompletion;
    }
    invariant(stmtCompletion instanceof Value);
    return stmtCompletion;
  } else {
    invariant(exprValue instanceof AbstractValue);
    return realm.evaluateWithAbstractConditional(
      exprValue,
      () => realm.evaluateNodeForEffects(ast.consequent, strictCode, env),
      () =>
        ast.alternate ? realm.evaluateNodeForEffects(ast.alternate, strictCode, env) : construct_empty_effects(realm)
    );
  }
}
