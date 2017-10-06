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
import { AbruptCompletion, Completion, PossiblyNormalCompletion, ThrowCompletion } from "../completions.js";
import { joinEffects, UpdateEmpty } from "../methods/index.js";
import { Value } from "../values/index.js";
import type { BabelNodeTryStatement } from "babel-types";
import invariant from "../invariant.js";

export default function(
  ast: BabelNodeTryStatement,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): PossiblyNormalCompletion | Value {
  let completions = [];

  let blockRes = env.evaluateAbstractCompletion(ast.block, strictCode);
  if (blockRes instanceof PossiblyNormalCompletion) {
    let abruptCompletion;
    let abruptEffects;
    if (blockRes.consequent instanceof AbruptCompletion) {
      abruptCompletion = blockRes.consequent;
      abruptEffects = blockRes.consequentEffects;
    } else {
      abruptCompletion = blockRes.alternate;
      abruptEffects = blockRes.alternateEffects;
    }
    if (abruptCompletion instanceof ThrowCompletion && ast.handler) {
      let normalEffects = realm.getCapturedEffects(blockRes.value);
      invariant(normalEffects !== undefined);
      realm.stopEffectCaptureAndUndoEffects();
      let handlerEffects = realm.evaluateForEffects(() => {
        realm.applyEffects(abruptEffects);
        invariant(ast.handler);
        return env.evaluateAbstractCompletion(ast.handler, strictCode, abruptCompletion);
      });
      let jointEffects;
      if (blockRes.consequent instanceof AbruptCompletion)
        jointEffects = joinEffects(realm, blockRes.joinCondition, handlerEffects, normalEffects);
      else jointEffects = joinEffects(realm, blockRes.joinCondition, normalEffects, handlerEffects);
      realm.applyEffects(jointEffects);
      completions.unshift(jointEffects[0]);
    } else {
      completions.unshift(blockRes);
    }
  } else {
    if (blockRes instanceof ThrowCompletion && ast.handler) {
      completions.unshift(env.evaluateCompletion(ast.handler, strictCode, blockRes));
    } else {
      completions.unshift(blockRes);
    }
  }

  if (ast.finalizer) {
    completions.unshift(env.evaluateCompletion(ast.finalizer, strictCode));
  }

  // use the last completion record
  for (let completion of completions) {
    if (completion instanceof AbruptCompletion) throw completion;
  }

  if (ast.finalizer) {
    completions.shift();
  }

  // otherwise use the last returned value
  for (let completion of completions) {
    if (completion instanceof Value || completion instanceof Completion)
      return (UpdateEmpty(realm, completion, realm.intrinsics.undefined): any);
  }

  invariant(false);
}
