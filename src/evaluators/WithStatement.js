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
import { LexicalEnvironment, ObjectEnvironmentRecord } from "../environment.js";
import { AbruptCompletion } from "../completions.js";
import { Value } from "../values/index.js";
import type { Reference } from "../environment.js";
import { ToObjectPartial, GetValue, NewObjectEnvironment, UpdateEmpty } from "../methods/index.js";
import invariant from "../invariant.js";
import type { BabelNodeWithStatement } from "babel-types";

// ECMA262 13.11.7
export default function (ast: BabelNodeWithStatement, strictCode: boolean, env: LexicalEnvironment, realm: Realm): Value | Reference {
  // 1. Let val be the result of evaluating Expression.
  let val = env.evaluate(ast.object, strictCode);

  // 2. Let obj be ? ToObject(? GetValue(val)).
  let obj = ToObjectPartial(realm, GetValue(realm, val));

  // 3. Let oldEnv be the running execution context's LexicalEnvironment.
  let oldEnv = env;

  // 4. Let newEnv be NewObjectEnvironment(obj, oldEnv).
  let newEnv = NewObjectEnvironment(realm, obj, oldEnv);

  // 5. Set the withEnvironment flag of newEnv's EnvironmentRecord to true.
  invariant(newEnv.environmentRecord instanceof ObjectEnvironmentRecord);
  newEnv.environmentRecord.withEnvironment = true;

  // 6. Set the running execution context's LexicalEnvironment to newEnv.
  realm.getRunningContext().lexicalEnvironment = newEnv;

  try {
    // 7. Let C be the result of evaluating Statement.
    let C = newEnv.evaluateCompletion(ast.body, strictCode);
    invariant(C instanceof Value || C instanceof AbruptCompletion);

    // 9. Return Completion(UpdateEmpty(C, undefined)).
    let res = UpdateEmpty(realm, C, realm.intrinsics.undefined);
    if (res instanceof AbruptCompletion) throw res;
    invariant(res instanceof Value);
    return res;
  } finally {
    // 8. Set the running execution context's LexicalEnvironment to oldEnv.
    realm.getRunningContext().lexicalEnvironment = oldEnv;
  }
}
