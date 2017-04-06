/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { AbruptCompletion, NormalCompletion } from "../completions.js";
import type { Realm } from "../realm.js";
import { construct_empty_effects } from "../realm.js";
import type { LexicalEnvironment } from "../environment.js";
import { AbstractValue, ConcreteValue, Value } from "../values/index.js";
import { Reference } from "../environment.js";
import { GetValue, joinEffects, ToBoolean } from "../methods/index.js";
import type { BabelNode, BabelNodeIfStatement } from "babel-types";
import invariant from "../invariant.js";

export function evaluate (
    ast: BabelNodeIfStatement, strictCode: boolean, env: LexicalEnvironment,
    realm: Realm): NormalCompletion | Value | Reference {
  let exprRef = env.evaluate(ast.test, strictCode);
  let exprValue = GetValue(realm, exprRef);

  if (exprValue instanceof ConcreteValue) {
    if (ToBoolean(realm, exprValue)) {
      env.evaluate(ast.consequent, strictCode);
    } else {
      if (ast.alternate) env.evaluate(ast.alternate, strictCode);
    }
    return realm.intrinsics.empty;
  }
  invariant(exprValue instanceof AbstractValue);

  if (!exprValue.mightNotBeObject()) {
    return env.evaluate(ast.consequent, strictCode);
  } else {
    return evaluateWithAbstractConditional(exprValue, ast.consequent, ast.alternate, strictCode, env, realm);
  }
}

export function evaluateWithAbstractConditional(condValue: AbstractValue,
    consequent: BabelNode, alternate: ?BabelNode, strictCode: boolean,
    env: LexicalEnvironment, realm: Realm): NormalCompletion | Value | Reference {
  // Evaluate consequent and alternate in sandboxes and get their effects.
  let [compl1, gen1, bindings1, properties1, createdObj1] =
    realm.partially_evaluate_node(consequent, strictCode, env);

  let [compl2, gen2, bindings2, properties2, createdObj2] =
    alternate ?
      realm.partially_evaluate_node(alternate, strictCode, env) :
      construct_empty_effects(realm);

  // Join the effects, creating an abstract view of what happened, regardless
  // of the actual value of condValue.
  let joinedEffects =
    joinEffects(realm, condValue,
      [compl1, gen1, bindings1, properties1, createdObj1],
      [compl2, gen2, bindings2, properties2, createdObj2]);
  let completion = joinedEffects[0];
  if (completion instanceof NormalCompletion) {
    // in this case one of the branches may complete abruptly, which means that
    // not all control flow branches join into one flow at this point.
    // Consequently we have to continue tracking changes until the point where
    // all the branches come together into one.
    realm.capture_effects();
  }
  // Note that the effects of (non joining) abrupt branches are not included
  // in joinedEffects, but are tracked separately inside completion.
  realm.apply_effects(joinedEffects);

  // return or throw completion
  if (completion instanceof AbruptCompletion) throw completion;
  invariant(completion instanceof NormalCompletion || completion instanceof Value || completion instanceof Reference);
  return completion;
}
