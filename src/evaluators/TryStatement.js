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
import { AbruptCompletion, ForkedAbruptCompletion, PossiblyNormalCompletion, ThrowCompletion } from "../completions.js";
import { UpdateEmpty } from "../methods/index.js";
import { Functions, Join } from "../singletons.js";
import { Value } from "../values/index.js";
import type { BabelNodeTryStatement } from "babel-types";
import invariant from "../invariant.js";

export default function(ast: BabelNodeTryStatement, strictCode: boolean, env: LexicalEnvironment, realm: Realm): Value {
  let wasInPureTryStatement = realm.isInPureTryStatement;
  if (realm.isInPureScope()) {
    // TODO(1264): This is used to issue a warning if we have abstract function calls in here.
    // We might not need it once we have full support for handling potential errors. Even
    // then we might need it to know whether we should bother tracking error handling.
    realm.isInPureTryStatement = true;
  }
  let blockRes;
  try {
    blockRes = env.evaluateCompletionDeref(ast.block, strictCode);
  } finally {
    realm.isInPureTryStatement = wasInPureTryStatement;
  }

  let handlerRes = blockRes;
  let handler = ast.handler;
  if (handler) {
    // The start of the catch handler is a join point where all throw completions come together
    blockRes = Functions.incorporateSavedCompletion(realm, blockRes);
    if (blockRes instanceof ThrowCompletion) {
      handlerRes = env.evaluateCompletionDeref(handler, strictCode, blockRes);
      // Note: The handler may have introduced new forks
    } else if (blockRes instanceof ForkedAbruptCompletion || blockRes instanceof PossiblyNormalCompletion) {
      if (blockRes instanceof PossiblyNormalCompletion) {
        // The throw completions have not been joined and we are going to keep it that way.
        // The current state may have advanced since the time control forked into the various paths recorded in blockRes.
        // Update the normal path and restore the global state to what it was at the time of the fork.
        let subsequentEffects = realm.getCapturedEffects(blockRes.value);
        realm.stopEffectCaptureAndUndoEffects(blockRes);
        Join.updatePossiblyNormalCompletionWithSubsequentEffects(realm, blockRes, subsequentEffects);
      }
      // Add effects of normal exits from handler to blockRes and apply to global state
      let handlerEffects = composeNestedThrowEffectsWithHandler(blockRes);
      realm.applyEffects(handlerEffects);
      handlerRes = handlerEffects.result;
    } else {
      // The handler is not invoked, so just carry on.
    }
  }

  let finalizerRes = handlerRes;
  if (ast.finalizer) {
    // The start of the finalizer is a join point where all threads of control come together.
    // However, we choose to keep the threads unjoined and to apply the finalizer separately to each thread.
    if (blockRes instanceof PossiblyNormalCompletion || blockRes instanceof ForkedAbruptCompletion) {
      // The current global state is a the point of the fork that led to blockRes
      // All subsequent effects are kept inside the branches of blockRes.
      let finalizerEffects = composeNestedEffectsWithFinalizer(blockRes);
      finalizerRes = finalizerEffects.result;
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
  // We do this by call joinForkOrChoose to create a new container at every level of the recursion.
  function composeNestedThrowEffectsWithHandler(
    c: PossiblyNormalCompletion | ForkedAbruptCompletion,
    priorEffects: Array<Effects> = []
  ): Effects {
    let consequent = c.consequent;
    let consequentEffects = c.consequentEffects;
    priorEffects.push(consequentEffects);
    if (consequent instanceof ForkedAbruptCompletion || consequent instanceof PossiblyNormalCompletion) {
      consequentEffects = composeNestedThrowEffectsWithHandler(consequent, priorEffects);
    } else if (consequent instanceof ThrowCompletion) {
      consequentEffects = realm.evaluateForEffectsWithPriorEffects(
        priorEffects,
        () => {
          invariant(ast.handler);
          return env.evaluateCompletionDeref(ast.handler, strictCode, consequent);
        },
        "composeNestedThrowEffectsWithHandler/1"
      );
      c.consequentEffects.result = c.consequent = new AbruptCompletion(realm.intrinsics.empty);
    }
    priorEffects.pop();
    let alternate = c.alternate;
    let alternateEffects = c.alternateEffects;
    priorEffects.push(alternateEffects);
    if (alternate instanceof PossiblyNormalCompletion || alternate instanceof ForkedAbruptCompletion) {
      alternateEffects = composeNestedThrowEffectsWithHandler(alternate, priorEffects);
    } else if (alternate instanceof ThrowCompletion) {
      alternateEffects = realm.evaluateForEffectsWithPriorEffects(
        priorEffects,
        () => {
          invariant(ast.handler);
          return env.evaluateCompletionDeref(ast.handler, strictCode, alternate);
        },
        "composeNestedThrowEffectsWithHandler/2"
      );
      c.alternateEffects.result = c.alternate = new AbruptCompletion(realm.intrinsics.empty);
    }
    priorEffects.pop();
    return Join.joinForkOrChoose(realm, c.joinCondition, consequentEffects, alternateEffects);
  }

  // The finalizer is not a join point, so update each path in the completion separately.
  // Things are complicated because the finalizer may turn normal completions into abrupt completions.
  // When this happens the container has to change its type.
  // We do this by call joinForkOrChoose to create a new container at every level of the recursion.
  function composeNestedEffectsWithFinalizer(
    c: PossiblyNormalCompletion | ForkedAbruptCompletion,
    priorEffects: Array<Effects> = []
  ): Effects {
    let consequent = c.consequent;
    let consequentEffects = c.consequentEffects;
    priorEffects.push(consequentEffects);
    if (consequent instanceof ForkedAbruptCompletion || consequent instanceof PossiblyNormalCompletion) {
      consequentEffects = composeNestedThrowEffectsWithHandler(consequent, priorEffects);
    } else {
      consequentEffects = realm.evaluateForEffectsWithPriorEffects(
        priorEffects,
        () => {
          invariant(ast.finalizer);
          return env.evaluateCompletionDeref(ast.finalizer, strictCode);
        },
        "composeNestedEffectsWithFinalizer/1"
      );
      if (!(consequentEffects.result instanceof AbruptCompletion)) consequentEffects.result = consequent;
    }
    priorEffects.pop();
    let alternate = c.alternate;
    let alternateEffects = c.alternateEffects;
    priorEffects.push(alternateEffects);
    if (alternate instanceof PossiblyNormalCompletion || alternate instanceof ForkedAbruptCompletion) {
      alternateEffects = composeNestedThrowEffectsWithHandler(alternate, priorEffects);
    } else {
      alternateEffects = realm.evaluateForEffectsWithPriorEffects(
        priorEffects,
        () => {
          invariant(ast.finalizer);
          return env.evaluateCompletionDeref(ast.finalizer, strictCode);
        },
        "composeNestedEffectsWithFinalizer/2"
      );
      if (!(alternateEffects.result instanceof AbruptCompletion)) alternateEffects.result = alternate;
    }
    priorEffects.pop();
    return Join.joinForkOrChoose(realm, c.joinCondition, consequentEffects, alternateEffects);
  }
}
