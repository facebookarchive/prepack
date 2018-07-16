/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import type { BabelNodeBooleanLiteral, BabelNodeStatement } from "@babel/types";
import type { LexicalEnvironment } from "../environment.js";
import type { Realm } from "../realm.js";

import { BooleanValue } from "../values/index.js";

export default function(
  ast: BabelNodeBooleanLiteral,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): [BooleanValue, BabelNodeBooleanLiteral, Array<BabelNodeStatement>] {
  let result = new BooleanValue(realm, ast.value);
  return [result, ast, []];
}
