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
import { Value } from "../values/index.js";
import { ThrowCompletion } from "../completions.js";
import invariant from "../invariant.js";
import { Environment } from "../singletons.js";
import type { BabelNodeCatchClause } from "@babel/types";

// ECAM262 13.15.7
export default function(
  ast: BabelNodeCatchClause,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm,
  thrownValue: any
): Value {
  invariant(thrownValue instanceof ThrowCompletion, "Metadata isn't a throw completion");

  // 1. Let oldEnv be the running execution context's LexicalEnvironment.
  let oldEnv = realm.getRunningContext().lexicalEnvironment;

  // 2. Let catchEnv be NewDeclarativeEnvironment(oldEnv).
  let catchEnv = Environment.NewDeclarativeEnvironment(realm, oldEnv);

  // 3. Let catchEnvRec be catchEnv's EnvironmentRecord.
  let catchEnvRec = catchEnv.environmentRecord;

  // 4. For each element argName of the BoundNames of CatchParameter, do
  for (let argName of Environment.BoundNames(realm, ast.param)) {
    // a. Perform ! catchEnvRec.CreateMutableBinding(argName, false).
    catchEnvRec.CreateMutableBinding(argName, false);
  }

  // 5. Set the running execution context's LexicalEnvironment to catchEnv.
  realm.getRunningContext().lexicalEnvironment = catchEnv;

  try {
    // 6. Let status be the result of performing BindingInitialization for CatchParameter passing thrownValue and catchEnv as arguments.
    Environment.BindingInitialization(realm, ast.param, thrownValue.value, strictCode, catchEnv);

    // 7. If status is an abrupt completion, then
    // a. Set the running execution context's LexicalEnvironment to oldEnv.
    // b. Return Completion(status).

    // 8. Let B be the result of evaluating Block.
    let B = catchEnv.evaluate(ast.body, strictCode);
    invariant(B instanceof Value);

    // 10. Return Completion(B).
    return B;
  } finally {
    // 9. Set the running execution context's LexicalEnvironment to oldEnv.
    realm.getRunningContext().lexicalEnvironment = oldEnv;
    realm.onDestroyScope(catchEnv);
  }
}
