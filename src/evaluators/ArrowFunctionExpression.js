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
import { Functions } from "../singletons.js";
import IsStrict from "../utils/strict.js";
import * as t from "@babel/types";
import type { BabelNodeArrowFunctionExpression } from "@babel/types";

// ECMA262 14.2.16
export default function(
  ast: BabelNodeArrowFunctionExpression,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): Value {
  let ConciseBody = ast.body;
  if (ConciseBody.type !== "BlockStatement") {
    ConciseBody = t.blockStatement([t.returnStatement(ConciseBody)]);
    // Use original array function's location for the new concise body.
    ConciseBody.loc = ast.body.loc;
  }

  // 1. If the function code for this ArrowFunction is strict mode code, let strict be true. Otherwise let strict be false.
  let strict = strictCode || IsStrict(ast.body);

  // 2. Let scope be the LexicalEnvironment of the running execution context.
  let scope = env;

  // 3. Let parameters be CoveredFormalsList of ArrowParameters.
  let parameters = ast.params;

  // 4. Let closure be FunctionCreate(Arrow, parameters, ConciseBody, scope, strict).
  let closure = Functions.FunctionCreate(realm, "arrow", parameters, ConciseBody, scope, strict);
  closure.loc = ast.loc;

  // 5. Return closure.
  return closure;
}
