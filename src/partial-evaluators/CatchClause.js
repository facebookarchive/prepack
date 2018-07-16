/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { BabelNodeCatchClause, BabelNodeStatement } from "@babel/types";
import type { Realm } from "../realm.js";
import type { LexicalEnvironment } from "../environment.js";

import { AbruptCompletion, ThrowCompletion } from "../completions.js";
import { Value } from "../values/index.js";
import invariant from "../invariant.js";

// ECAM262 13.15.7
export default function(
  ast: BabelNodeCatchClause,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm,
  thrownValue: any
): [AbruptCompletion | Value, BabelNodeCatchClause, Array<BabelNodeStatement>] {
  invariant(thrownValue instanceof ThrowCompletion, "Metadata isn't a throw completion");

  let result = env.evaluateCompletionDeref(ast, strictCode);
  return [result, ast, []];
}
