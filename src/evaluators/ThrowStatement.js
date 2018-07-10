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
import { PureScopeThrowCompletion, ThrowCompletion } from "../completions.js";
import { Environment } from "../singletons.js";
import invariant from "../invariant.js";
import type { BabelNodeThrowStatement } from "babel-types";

export default function(
  ast: BabelNodeThrowStatement,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): Value {
  let exprRef = env.evaluate(ast.argument, strictCode);
  let exprValue = Environment.GetValue(realm, exprRef);
  if (realm.isInPureScope() && !realm.isInPureTryStatement) {
    invariant(realm.generator !== undefined);
    realm.generator.emitThrow(exprValue);
    throw new PureScopeThrowCompletion(exprValue, ast.loc);
  }
  throw new ThrowCompletion(exprValue, ast.loc);
}
