/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { Realm } from "../realm.js";
import type { LexicalEnvironment } from "../environment.js";
import type { Value } from "../values/index.js";
import type { Reference } from "../environment.js";
import { GetValue } from "../methods/index.js";
import type { BabelNodeExpressionStatement } from "babel-types";

export default function (ast: BabelNodeExpressionStatement, strictCode: boolean, env: LexicalEnvironment, realm: Realm): Value | Reference {
  // ECMA262 13.5.1
  // 1. Let exprRef be the result of evaluating Expression.
  let exprRef = env.evaluate(ast.expression, strictCode);

  // 2. Return ? GetValue(exprRef).
  return GetValue(realm, exprRef);
}
