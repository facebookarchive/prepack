/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import type { BabelNodeBlockStatement } from "@babel/types";
import type { Realm } from "../realm.js";
import type { LexicalEnvironment } from "../environment.js";

import { StringValue, Value } from "../values/index.js";
import { Environment, Functions } from "../singletons.js";

// ECMA262 13.2.13
export default function(
  ast: BabelNodeBlockStatement,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): Value {
  // 1. Let oldEnv be the running execution context's LexicalEnvironment.
  let oldEnv = realm.getRunningContext().lexicalEnvironment;

  // 2. Let blockEnv be NewDeclarativeEnvironment(oldEnv).
  let blockEnv = Environment.NewDeclarativeEnvironment(realm, oldEnv);

  // 3. Perform BlockDeclarationInstantiation(StatementList, blockEnv).
  Environment.BlockDeclarationInstantiation(realm, strictCode, ast.body, blockEnv);

  // 4. Set the running execution context's LexicalEnvironment to blockEnv.
  realm.getRunningContext().lexicalEnvironment = blockEnv;

  try {
    // 5. Let blockValue be the result of evaluating StatementList.
    let blockValue: void | Value;

    if (ast.directives) {
      for (let directive of ast.directives) {
        blockValue = new StringValue(realm, directive.value.value);
      }
    }

    return Functions.EvaluateStatements(ast.body, blockValue, strictCode, blockEnv, realm);
  } finally {
    // 6. Set the running execution context's LexicalEnvironment to oldEnv.
    realm.getRunningContext().lexicalEnvironment = oldEnv;
    realm.onDestroyScope(blockEnv);
  }
}
