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
import { ThrowCompletion } from "../completions.js";
import { GetValue } from "../methods/index.js";
import type { BabelNodeThrowStatement } from "babel-types";

export default function (ast: BabelNodeThrowStatement, strictCode: boolean, env: LexicalEnvironment, realm: Realm): Value | Reference {
  let exprRef = env.evaluate(ast.argument, strictCode);
  let exprValue = GetValue(realm, exprRef);
  throw new ThrowCompletion(exprValue);
}
