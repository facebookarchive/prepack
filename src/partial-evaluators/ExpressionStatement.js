/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { BabelNodeExpressionStatement, BabelNodeStatement } from "@babel/types";
import type { LexicalEnvironment } from "../environment.js";
import type { Realm } from "../realm.js";

import { Completion } from "../completions.js";
import { Value } from "../values/index.js";
import * as t from "@babel/types";

// ECMA262 13.5.1
export default function(
  ast: BabelNodeExpressionStatement,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): [Completion | Value, BabelNodeExpressionStatement, Array<BabelNodeStatement>] {
  let [result, partial_expression_ast, io] = env.partiallyEvaluateCompletionDeref(ast.expression, strictCode);
  let partial_ast = t.expressionStatement((partial_expression_ast: any));
  return [result, partial_ast, io];
}
