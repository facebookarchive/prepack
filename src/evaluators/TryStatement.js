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
import { type LexicalEnvironment } from "../environment.js";
import {
  AbruptCompletion,
  Completion,
  JoinedAbruptCompletions,
  JoinedNormalAndAbruptCompletions,
  ThrowCompletion,
} from "../completions.js";
import { UpdateEmpty } from "../methods/index.js";
import { InfeasiblePathError } from "../errors.js";
import { construct_empty_effects } from "../realm.js";
import { Functions, Join, Path } from "../singletons.js";
import { AbstractValue, Value } from "../values/index.js";
import type { BabelNodeTryStatement } from "@babel/types";
import invariant from "../invariant.js";

export default function(ast: BabelNodeTryStatement, strictCode: boolean, env: LexicalEnvironment, realm: Realm): Value {
  if (realm.useAbstractInterpretation) return joinTryBlockWithHandlers(ast, strictCode, env, realm);

  let blockRes = env.evaluateCompletionDeref(ast.block, strictCode);
  let result = blockRes;

  if (blockRes instanceof ThrowCompletion && ast.handler) {
    result = env.evaluateCompletionDeref(ast.handler, strictCode, blockRes);
  }

  if (ast.finalizer) {
    result = composeResults(result, env.evaluateCompletionDeref(ast.finalizer, strictCode));
  }

  return realm.returnOrThrowCompletion(UpdateEmpty(realm, result, realm.intrinsics.undefined));
}

function composeResults(r1: Completion | Value, r2: Completion | Value): Completion | Value {
  if (r2 instanceof AbruptCompletion) return r2;
  return Join.composeCompletions(r2, r1);
}

function joinTryBlockWithHandlers(
  ast: BabelNodeTryStatement,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): Value {
  let savedIsInPureTryStatement = realm.isInPureTryStatement;
  if (realm.isInPureScope()) {
    // TODO(1264): This is used to issue a warning if we have abstract function calls in here.
    // We might not need it once we have full support for handling potential errors. Even
    // then we might need it to know whether we should bother tracking error handling.
    realm.isInPureTryStatement = true;
  }
  let blockRes = env.evaluateCompletionDeref(ast.block, strictCode);
  // this is a join point for break and continue completions
  blockRes = Functions.incorporateSavedCompletion(realm, blockRes);
  invariant(blockRes !== undefined);
  realm.isInPureTryStatement = savedIsInPureTryStatement;

  let result = blockRes;
  let handler = ast.handler;
  let selector = c => c instanceof ThrowCompletion;
  if (handler && blockRes instanceof Completion && blockRes.containsSelectedCompletion(selector)) {
    if (blockRes instanceof ThrowCompletion) {
      result = env.evaluateCompletionDeref(handler, strictCode, blockRes);
    } else {
      invariant(blockRes instanceof JoinedAbruptCompletions || blockRes instanceof JoinedNormalAndAbruptCompletions);
      // put the handler under a guard that excludes normal paths from entering it.
      let joinCondition = AbstractValue.createJoinConditionForSelectedCompletions(selector, blockRes);
      if (joinCondition.mightNotBeFalse()) {
        try {
          let handlerEffects = Path.withCondition(joinCondition, () => {
            invariant(blockRes instanceof Completion);
            let joinedThrow = new ThrowCompletion(Join.joinValuesOfSelectedCompletions(selector, blockRes));
            let handlerEval = () => env.evaluateCompletionDeref(handler, strictCode, joinedThrow);
            return realm.evaluateForEffects(handlerEval, undefined, "joinTryBlockWithHandlers");
          });
          Completion.makeSelectedCompletionsInfeasible(selector, blockRes);
          let emptyEffects = construct_empty_effects(realm, blockRes);
          handlerEffects = Join.joinEffects(joinCondition, handlerEffects, emptyEffects);
          realm.applyEffects(handlerEffects);
          result = handlerEffects.result;
        } catch (e) {
          if (!(e instanceof InfeasiblePathError)) throw e;
          // It turns out that the handler is not reachable after all so just do nothing and carry on
        }
      }
    }
  }

  if (ast.finalizer) {
    let res = env.evaluateCompletionDeref(ast.finalizer, strictCode);
    result = composeResults(result, res);
  }
  return realm.returnOrThrowCompletion(UpdateEmpty(realm, result, realm.intrinsics.undefined));
}
