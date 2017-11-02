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
  let blockRes = env.evaluateCompletionDeref(ast.block, strictCode);

  let handlerRes = blockRes;
  let handler = ast.handler;
  if (handler) {
    // The start of the catch handler is a join point where all throw completions come together
    blockRes = incorporateSavedCompletion(realm, blockRes);
    if (blockRes instanceof ThrowCompletion) {
      handlerRes = env.evaluateCompletionDeref(handler, strictCode, blockRes);
      // Note: The handler may have introduced new forks
    } else if (blockRes instanceof JoinedAbruptCompletions || blockRes instanceof PossiblyNormalCompletion) {
      if (blockRes instanceof PossiblyNormalCompletion) {
        // Nothing has been joined and we are going to keep it that way.
        // The current state may have advanced since the time control forked into the various paths recorded in blockRes.
        // Update the normal path and restore the global state to what it was at the time of the fork.
        let subsequentEffects = realm.getCapturedEffects(blockRes, blockRes.value);
        invariant(subsequentEffects !== undefined);
        realm.stopEffectCaptureAndUndoEffects(blockRes);
        updatePossiblyNormalCompletionWithSubsequentEffects(realm, blockRes, subsequentEffects);
      }
      // All of the forked threads of control are now joined together and the global state reflects their joint effects
      let handlerEffects = composeNestedThrowEffectsWithHandler(blockRes);
      handlerRes = handlerEffects[0];
      if (handlerRes instanceof Value) {
        // This can happen if all of the abrupt completions in blockRes were throw completions
        // and if the handler does not introduce any abrupt completions of its own.
        realm.applyEffects(handlerEffects);
        // The global state is now all joined up
      } else {
        // more than thread of control leaves the handler
        // The effects of each thread is tracked in handlerRes
      }
    } else {
      // The handler is not invoked, so just carry on.
    }
  }

  let finalizerRes = handlerRes;
  if (ast.finalizer) {
    // The start of the finalizer is a join point where all threads of control come together.
    // However, we choose to keep the threads unjoined and to apply the finalizer separately to each thread.
    if (blockRes instanceof PossiblyNormalCompletion || blockRes instanceof JoinedAbruptCompletions) {
      // The current global state is a the point of the fork that led to blockRes
      // All subsequent effects are kept inside the branches of blockRes.
      let finalizerEffects = composeNestedEffectsWithFinalizer(blockRes);
      finalizerRes = finalizerEffects[0];
      // The result may become abrupt because of the finalizer, but it cannot become normal.
      invariant(!(finalizerRes instanceof Value));
    } else {
      // A single thread of control has produced a normal blockRes and the global state is up to date.
      finalizerRes = env.evaluateCompletion(ast.finalizer, strictCode);
    }
  }

  if (finalizerRes instanceof AbruptCompletion) throw finalizerRes;
  if (finalizerRes instanceof PossiblyNormalCompletion) realm.composeWithSavedCompletion(finalizerRes);
  if (handlerRes instanceof PossiblyNormalCompletion) handlerRes = handlerRes.value;
  if (handlerRes instanceof Value) return (UpdateEmpty(realm, handlerRes, realm.intrinsics.undefined): any);
  throw handlerRes;

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

  // The finalizer is not a join point, so update each path in the completion separately.
  // Things are complicated because the finalizer may turn normal completions into abrupt completions.
  // When this happens the container has to change its type.
  // We do this by call joinEffects to create a new container at every level of the recursion.
  function composeNestedEffectsWithFinalizer(
    c: PossiblyNormalCompletion | JoinedAbruptCompletions,
    priorEffects: Array<Effects> = []
  ): Effects {
    let consequent = c.consequent;
    let consequentEffects = c.consequentEffects;
    priorEffects.push(consequentEffects);
    if (consequent instanceof JoinedAbruptCompletions || consequent instanceof PossiblyNormalCompletion) {
      consequentEffects = composeNestedThrowEffectsWithHandler(consequent, priorEffects);
    } else {
      consequentEffects = realm.evaluateForEffects(() => {
        for (let priorEffect of priorEffects) realm.applyEffects(priorEffect);
        invariant(ast.finalizer);
        return env.evaluateCompletionDeref(ast.finalizer, strictCode);
      });
      if (!(consequentEffects[0] instanceof AbruptCompletion)) consequentEffects[0] = consequent;
    }
    priorEffects.pop();
    let alternate = c.alternate;
    let alternateEffects = c.alternateEffects;
    priorEffects.push(alternateEffects);
    if (alternate instanceof PossiblyNormalCompletion || alternate instanceof JoinedAbruptCompletions) {
      alternateEffects = composeNestedThrowEffectsWithHandler(alternate, priorEffects);
    } else {
      alternateEffects = realm.evaluateForEffects(() => {
        for (let priorEffect of priorEffects) realm.applyEffects(priorEffect);
        invariant(ast.finalizer);
        return env.evaluateCompletionDeref(ast.finalizer, strictCode);
      });
      if (!(alternateEffects[0] instanceof AbruptCompletion)) alternateEffects[0] = alternate;
    }
    priorEffects.pop();
    return joinEffects(realm, c.joinCondition, consequentEffects, alternateEffects);
  }
}
