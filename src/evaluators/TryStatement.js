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
import type { Reference } from "../environment.js";
import { AbruptCompletion, IntrospectionThrowCompletion, ThrowCompletion } from "../completions.js";
import { Value } from "../values/index.js";
import type { BabelNodeTryStatement } from "babel-types";

export default function (ast: BabelNodeTryStatement, strictCode: boolean, env: LexicalEnvironment, realm: Realm): Value | Reference {
  let completions = [];

  let blockRes = env.evaluateCompletion(ast.block, strictCode);

  // can't catch or run finally clauses on introspection errors
  if (blockRes instanceof IntrospectionThrowCompletion) throw blockRes;

  if (blockRes instanceof ThrowCompletion && ast.handler) {
    completions.unshift(env.evaluateCompletion(ast.handler, strictCode, blockRes));
  } else {
    completions.unshift(blockRes);
  }

  if (ast.finalizer) {
    completions.unshift(env.evaluateCompletion(ast.finalizer, strictCode));
  }

  // use the last completion record
  for (let completion of completions) {
    if (completion && completion instanceof AbruptCompletion) throw completion;
  }

  // otherwise use the last returned value
  for (let completion of completions) {
    if (completion && completion instanceof Value) return completion;
  }

  throw new Error("shouldn't meet this condition");
}
