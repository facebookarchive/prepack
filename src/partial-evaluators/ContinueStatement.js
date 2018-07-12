/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import type { BabelNodeContinueStatement, BabelNodeStatement } from "babel-types";
import type { LexicalEnvironment } from "../environment.js";
import type { Realm } from "../realm.js";

import { ContinueCompletion } from "../completions.js";

export default function(
  ast: BabelNodeContinueStatement,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): [ContinueCompletion, BabelNodeContinueStatement, Array<BabelNodeStatement>] {
  let result = new ContinueCompletion(realm.intrinsics.empty, undefined, ast.loc, ast.label && ast.label.name);
  return [result, ast, []];
}
