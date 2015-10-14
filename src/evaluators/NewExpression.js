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
import { ObjectValue } from "../values/index.js";
import { GetValue } from "../methods/index.js";
import { IsConstructor } from "../methods/index.js";
import { ArgumentListEvaluation } from "../methods/index.js";
import { Construct } from "../methods/index.js";
import invariant from "../invariant.js";
import type { BabelNodeNewExpression } from "babel-types";

export default function (ast: BabelNodeNewExpression, strictCode: boolean, env: LexicalEnvironment, realm: Realm): ObjectValue {
  realm.setNextExecutionContextLocation(ast.loc);

  // ECMA262 12.3.3.1 We just implement this method inline since it's only called here.
  // 1. Return ? EvaluateNew(NewExpression, empty).

  // ECMA262 2.3.3.1.1

  let constructProduction = ast.callee;
  let args = ast.arguments;

  // These steps not necessary due to our AST representation.
  // 1. Assert: constructProduction is either a NewExpression or a MemberExpression.
  // 2. Assert: arguments is either empty or an Arguments production.

  // 3. Let ref be the result of evaluating constructProduction.
  let ref = env.evaluate(constructProduction, strictCode);

  // 4. Let constructor be ? GetValue(ref).
  let constructor = GetValue(realm, ref);

  let argsList;

  // 5. If arguments is empty, let argList be a new empty List.
  if (!args.length) {
    argsList = [];
  } else { // 6. Else,
    // a. Let argList be ArgumentListEvaluation of arguments.
    argsList = ArgumentListEvaluation(realm, strictCode, env, args);

    // This step not necessary since we propagate completions with exceptions.
    // b. ReturnIfAbrupt(argList).
  }

  // 7. If IsConstructor(constructor) is false, throw a TypeError exception.
  if (IsConstructor(realm, constructor) === false) {
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
  }
  invariant(constructor instanceof ObjectValue);

  // 8. Return ? Construct(constructor, argList).
  return Construct(realm, constructor, argsList);
}
