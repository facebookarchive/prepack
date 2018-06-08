/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import type { BabelNodeReturnStatement, BabelNodeStatement } from "babel-types";
import type { Realm } from "../realm.js";
import type { LexicalEnvironment } from "../environment.js";

import { AbruptCompletion, ReturnCompletion } from "../completions.js";

export default function(
  ast: BabelNodeReturnStatement,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): [AbruptCompletion, BabelNodeReturnStatement, Array<BabelNodeStatement>] {
  let result;
  if (ast.argument) {
    result = env.evaluateCompletionDeref(ast.argument, strictCode);
  } else {
    result = realm.intrinsics.undefined;
  }
  if (!(result instanceof AbruptCompletion)) result = new ReturnCompletion(result, ast.loc);
  return [result, ast, []];
}
