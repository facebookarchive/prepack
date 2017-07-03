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
import { AbruptCompletion, Completion, NormalCompletion } from "../completions.js";
import { construct_empty_effects } from "../realm.js";
import type { LexicalEnvironment } from "../environment.js";
import { AbstractValue, ConcreteValue, Value } from "../values/index.js";
import { Reference } from "../environment.js";
import { GetValue, joinEffects, ToBoolean } from "../methods/index.js";
import type { BabelNodeLogicalExpression } from "babel-types";
import invariant from "../invariant.js";

export default function(
  ast: BabelNodeLogicalExpression,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): Completion | Value | Reference {
  let lref = env.evaluate(ast.left, strictCode);
  let lval = GetValue(realm, lref);

  if (lval instanceof ConcreteValue) {
    let lbool = ToBoolean(realm, lval);

    if (ast.operator === "&&") {
      // ECMA262 12.13.3
      if (lbool === false) return lval;
    } else if (ast.operator === "||") {
      // ECMA262 12.13.3
      if (lbool === true) return lval;
    }

    let rref = env.evaluate(ast.right, strictCode);
    return GetValue(realm, rref);
  }
  invariant(lval instanceof AbstractValue);

  if (!lval.mightNotBeObject()) {
    if (ast.operator === "&&") return env.evaluate(ast.right, strictCode);
    else {
      return lval;
    }
  }

  // Create empty effects for the case where ast.right is not evaluated
  let [compl1, gen1, bindings1, properties1, createdObj1] = construct_empty_effects(realm);
  compl1; // ignore

  // Evaluate ast.right in a sandbox to get its effects
  let [compl2, gen2, bindings2, properties2, createdObj2] = realm.evaluateNodeForEffects(ast.right, strictCode, env);

  // Join the effects, creating an abstract view of what happened, regardless
  // of the actual value of lval.
  // Note that converting a value to boolean never has a side effect, so we can
  // use lval as is for the join condition.
  let joinedEffects;
  if (ast.operator === "&&") {
    joinedEffects = joinEffects(
      realm,
      lval,
      [compl2, gen2, bindings2, properties2, createdObj2],
      [lval, gen1, bindings1, properties1, createdObj1]
    );
  } else {
    joinedEffects = joinEffects(
      realm,
      lval,
      [lval, gen1, bindings1, properties1, createdObj1],
      [compl2, gen2, bindings2, properties2, createdObj2]
    );
  }
  let completion = joinedEffects[0];
  if (completion instanceof NormalCompletion) {
    // in this case the evaluation of ast.right may complete abruptly, which means that
    // not all control flow branches join into one flow at this point.
    // Consequently we have to continue tracking changes until the point where
    // all the branches come together into one.
    realm.captureEffects();
  }
  // Note that the effects of (non joining) abrupt branches are not included
  // in joinedEffects, but are tracked separately inside completion.
  realm.applyEffects(joinedEffects);

  // return or throw completion
  if (completion instanceof AbruptCompletion) throw completion;
  invariant(completion instanceof NormalCompletion || completion instanceof Value || completion instanceof Reference);
  return completion;
}
