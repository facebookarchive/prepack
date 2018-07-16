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
import { EvaluateCall } from "../methods/call.js";
import type { BabelNodeTaggedTemplateExpression } from "@babel/types";

// ECMA262 12.3.7
export default function(
  ast: BabelNodeTaggedTemplateExpression,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): Value {
  // 1. Let tagRef be the result of evaluating MemberExpression.
  let tagRef = env.evaluate(ast.tag, strictCode);

  // 2. Let thisCall be this MemberExpression.

  // 3. Let tailCall be IsInTailPosition(thisCall).

  // 4. Return ? EvaluateCall(tagRef, TemplateLiteral, tailCall).
  return EvaluateCall(realm, strictCode, env, tagRef, ast.quasi);
}
