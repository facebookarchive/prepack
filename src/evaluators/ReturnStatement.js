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
import { Environment } from "../singletons.js";
import { ReturnCompletion } from "../completions.js";
import type { BabelNodeReturnStatement } from "@babel/types";

export default function(
  ast: BabelNodeReturnStatement,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): Value {
  let arg;
  if (ast.argument) {
    arg = Environment.GetValue(realm, env.evaluate(ast.argument, strictCode));
  } else {
    arg = realm.intrinsics.undefined;
  }
  throw new ReturnCompletion(arg, ast.loc);
}
