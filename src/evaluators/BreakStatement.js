/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import type { Realm } from "../realm.js";
import type { LexicalEnvironment } from "../environment.js";
import type { Value } from "../values/index.js";
import { BreakCompletion } from "../completions.js";
import type { BabelNodeBreakStatement } from "@babel/types";

export default function(
  ast: BabelNodeBreakStatement,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): Value {
  throw new BreakCompletion(realm.intrinsics.empty, ast.loc, ast.label && ast.label.name);
}
