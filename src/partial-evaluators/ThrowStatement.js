/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { BabelNode, BabelNodeStatement, BabelNodeThrowStatement } from "babel-types";
import type { LexicalEnvironment } from "../environment.js";
import type { Realm } from "../realm.js";
import { Completion, ThrowCompletion } from "../completions.js";
import { Value } from "../values/index.js";
import * as t from "babel-types";

export default function(
  ast: BabelNodeThrowStatement,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): [Completion | Value, BabelNode, Array<BabelNodeStatement>] {
  let [argValue, argAst, io] = env.partiallyEvaluateCompletionDeref(ast.argument, strictCode);
  if (argValue instanceof Value) {
    let c = new ThrowCompletion(argValue, undefined, ast.loc);
    let s = t.throwStatement((argAst: any)); // will be an expression because argValue is a Value
    return [c, s, io];
  }
  return [argValue, argAst, io];
}
