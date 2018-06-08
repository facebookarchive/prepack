/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import type { BabelNodeMemberExpression, BabelNodeStatement } from "babel-types";
import type { LexicalEnvironment, Reference } from "../environment.js";
import type { Realm } from "../realm.js";

import { AbruptCompletion } from "../completions.js";
import { Value } from "../values/index.js";

// ECMA262 12.3.2.1
export default function(
  ast: BabelNodeMemberExpression,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): [AbruptCompletion | Reference | Value, BabelNodeMemberExpression, Array<BabelNodeStatement>] {
  let result = env.evaluateCompletion(ast, strictCode);
  return [result, ast, []];
}
