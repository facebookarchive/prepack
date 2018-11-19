/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import type { BabelNodeExpression, BabelNodeSpreadElement } from "@babel/types";
import type { Realm } from "../realm.js";
import type { LexicalEnvironment } from "../environment.js";
import { FunctionEnvironmentRecord } from "../environment.js";
import { Value, UndefinedValue, ObjectValue } from "../values/index.js";
import { GetNewTarget, ArgumentListEvaluation, Construct, IsConstructor } from "../methods/index.js";
import { Environment } from "../singletons.js";
import invariant from "../invariant.js";

function GetSuperConstructor(realm: Realm) {
  // 1. Let envRec be GetThisEnvironment( ).
  let envRec = Environment.GetThisEnvironment(realm);

  // 2. Assert: envRec is a function Environment Record.
  invariant(envRec instanceof FunctionEnvironmentRecord);

  // 3. Let activeFunction be envRec.[[FunctionObject]].
  let activeFunction = envRec.$FunctionObject;

  // 4. Let superConstructor be activeFunction.[[GetPrototypeOf]]().
  let superConstructor = activeFunction.$GetPrototypeOf();

  // 5. ReturnIfAbrupt(superConstructor).

  // 6. If IsConstructor(superConstructor) is false, throw a TypeError exception.
  if (!IsConstructor(realm, superConstructor)) {
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "super called outside of constructor");
  }
  invariant(superConstructor instanceof ObjectValue);

  // 7. Return superConstructor.
  return superConstructor;
}

// ECMA262 12.3.5.1
export default function SuperCall(
  Arguments: Array<BabelNodeExpression | BabelNodeSpreadElement>,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): Value {
  // 1. Let newTarget be GetNewTarget().
  let newTarget = GetNewTarget(realm);

  // 2. If newTarget is undefined, throw a ReferenceError exception.
  if (newTarget instanceof UndefinedValue) {
    throw realm.createErrorThrowCompletion(realm.intrinsics.ReferenceError, "newTarget is undefined");
  }

  // 3. Let func be GetSuperConstructor().
  let func = GetSuperConstructor(realm);

  // 4. ReturnIfAbrupt(func).

  // 5. Let argList be ArgumentListEvaluation of Arguments.
  let argList = ArgumentListEvaluation(realm, strictCode, env, Arguments);

  // 6. ReturnIfAbrupt(argList).

  // 7. Let result be Construct(func, argList, newTarget).
  let result = Construct(realm, func, argList, newTarget).throwIfNotConcreteObject();

  // 8. ReturnIfAbrupt(result).

  // 9. Let thisER be GetThisEnvironment( ).
  let thisER = Environment.GetThisEnvironment(realm);

  // 10. Return thisER.BindThisValue(result).
  return thisER.BindThisValue(result);
}
