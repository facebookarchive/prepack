/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { BabelNodeFile, BabelNodeStatement } from "@babel/types";
import type { LexicalEnvironment } from "../environment.js";
import type { Realm } from "../realm.js";

import { Completion } from "../completions.js";
import { Value } from "../values/index.js";
import * as t from "@babel/types";

export default function(
  ast: BabelNodeFile,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): [Completion | Value, BabelNodeFile, Array<BabelNodeStatement>] {
  let [result, partial_program, io] = env.partiallyEvaluateCompletionDeref(ast.program, strictCode);
  let partial_file = t.file((partial_program: any), ast.comments, ast.tokens);
  return [result, partial_file, io];
}
