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
import { type LexicalEnvironment } from "../environment.js";
import {
  AbruptCompletion,
  JoinedAbruptCompletions,
  PossiblyNormalCompletion,
  ThrowCompletion,
} from "../completions.js";
import {
  incorporateSavedCompletion,
  joinEffects,
  UpdateEmpty,
  updatePossiblyNormalCompletionWithSubsequentEffects,
} from "../methods/index.js";
import { Value } from "../values/index.js";
import type { BabelNodeTryStatement } from "babel-types";
import invariant from "../invariant.js";

export default function(ast: BabelNodeTryStatement, strictCode: boolean, env: LexicalEnvironment, realm: Realm): Value {
  let completions = [];

  let blockRes = env.evaluateCompletionDeref(ast.block, strictCode);
  blockRes = incorporateSavedCompletion(realm, blockRes);
  if (blockRes instanceof PossiblyNormalCompletion) {
    // The current state may have advanced since the time control forked into the various paths recorded in blockRes.
    // Update the normal path and restore the global state to what it was at the time of the fork.
    let subsequentEffects = realm.getCapturedEffects(blockRes.value);
    invariant(subsequentEffects !== undefined);
    realm.stopEffectCaptureAndUndoEffects();
    updatePossiblyNormalCompletionWithSubsequentEffects(realm, blockRes, subsequentEffects);
  }

  if (ast.handler) {
    if (blockRes instanceof ThrowCompletion) {
      blockRes = env.evaluateCompletionDeref(ast.handler, strictCode, blockRes);
    } else if (blockRes instanceof JoinedAbruptCompletions || blockRes instanceof PossiblyNormalCompletion) {
      let handlerEffects = composeNestedThrowEffectsWithHandler(blockRes);
      blockRes = handlerEffects[0];
      // If there is a normal execution path following the handler, we need to update the current state
      if (blockRes instanceof Value || blockRes instanceof PossiblyNormalCompletion) realm.applyEffects(handlerEffects);
    }
  }
  completions.unshift(blockRes);

  if (ast.finalizer) {
    if (blockRes instanceof PossiblyNormalCompletion || blockRes instanceof JoinedAbruptCompletions) {
      completions.unshift(composeNestedEffectsWithFinalizer(blockRes));
    } else {
      completions.unshift(env.evaluateCompletion(ast.finalizer, strictCode));
    }
  }

  // Restart effect capture if one of the paths may continue
  if (blockRes instanceof PossiblyNormalCompletion) realm.captureEffects();

  // use the last completion record
  for (let completion of completions) {
    if (completion instanceof AbruptCompletion) throw completion;
  }

  if (ast.finalizer) {
    completions.shift();
  }

  // otherwise use the last returned value
  for (let completion of completions) {
    if (completion instanceof PossiblyNormalCompletion)
      completion = realm.getRunningContext().composeWithSavedCompletion(completion);
    if (completion instanceof Value) return (UpdateEmpty(realm, completion, realm.intrinsics.undefined): any);
  }

  invariant(false);

  // The finalizer is not a join point, so update each path in the completion separately.
  function composeNestedEffectsWithFinalizer(
    c: PossiblyNormalCompletion | JoinedAbruptCompletions,
    priorEffects: Array<Effects> = []
  ) {
    priorEffects.push(c.consequentEffects);
    let consequent = c.consequent;
    if (consequent instanceof PossiblyNormalCompletion || consequent instanceof JoinedAbruptCompletions) {
      composeNestedEffectsWithFinalizer(consequent, priorEffects);
    } else {
      c.consequentEffects = realm.evaluateForEffects(() => {
        for (let priorEffect of priorEffects) realm.applyEffects(priorEffect);
        invariant(ast.finalizer);
        return env.evaluateCompletionDeref(ast.finalizer, strictCode);
      });
      let fc = c.consequentEffects[0];
      // If the finalizer had an abrupt completion, it overrides the try-block's completion.
      if (fc instanceof AbruptCompletion) c.consequent = fc;
      else c.consequentEffects[0] = consequent;
    }
    priorEffects.pop();
    priorEffects.push(c.alternateEffects);
    let alternate = c.alternate;
    if (alternate instanceof PossiblyNormalCompletion || alternate instanceof JoinedAbruptCompletions) {
      composeNestedEffectsWithFinalizer(alternate, priorEffects);
    } else {
      c.alternateEffects = realm.evaluateForEffects(() => {
        for (let priorEffect of priorEffects) realm.applyEffects(priorEffect);
        invariant(ast.finalizer);
        return env.evaluateCompletionDeref(ast.finalizer, strictCode);
      });
      let fc = c.alternateEffects[0];
      // If the finalizer had an abrupt completion, it overrides the try-block's completion.
      if (fc instanceof AbruptCompletion) c.alternate = fc;
      else c.alternateEffects[0] = alternate;
    }
  }

  // The handler is a potential join point for all throw completions, but is easier to not do the join here because
  // it is tricky to join the joined and composed result of the throw completions with the non exceptional completions.
  // Unfortunately, things are still complicated because the handler may turn abrupt completions into normal
  // completions and the other way around. When this happens the container has to change its type.
  // We do this by call joinEffects to create a new container at every level of the recursion.
  function composeNestedThrowEffectsWithHandler(
    c: PossiblyNormalCompletion | JoinedAbruptCompletions,
    priorEffects: Array<Effects> = []
  ): Effects {
    let consequent = c.consequent;
    let consequentEffects = c.consequentEffects;
    priorEffects.push(consequentEffects);
    if (consequent instanceof JoinedAbruptCompletions || consequent instanceof PossiblyNormalCompletion) {
      consequentEffects = composeNestedThrowEffectsWithHandler(consequent, priorEffects);
    } else if (consequent instanceof ThrowCompletion) {
      consequentEffects = realm.evaluateForEffects(() => {
        for (let priorEffect of priorEffects) realm.applyEffects(priorEffect);
        invariant(ast.handler);
        return env.evaluateCompletionDeref(ast.handler, strictCode, consequent);
      });
    }
    priorEffects.pop();
    let alternate = c.alternate;
    let alternateEffects = c.alternateEffects;
    priorEffects.push(alternateEffects);
    if (alternate instanceof PossiblyNormalCompletion || alternate instanceof JoinedAbruptCompletions) {
      alternateEffects = composeNestedThrowEffectsWithHandler(alternate, priorEffects);
    } else if (alternate instanceof ThrowCompletion) {
      alternateEffects = realm.evaluateForEffects(() => {
        for (let priorEffect of priorEffects) realm.applyEffects(priorEffect);
        invariant(ast.handler);
        return env.evaluateCompletionDeref(ast.handler, strictCode, alternate);
      });
    }
    priorEffects.pop();
    return joinEffects(realm, c.joinCondition, consequentEffects, alternateEffects);
  }
}
