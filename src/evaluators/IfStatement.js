/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { AbruptCompletion, Completion, NormalCompletion } from "../completions.js";
import type { Realm } from "../realm.js";
import { construct_empty_effects } from "../realm.js";
import type { LexicalEnvironment } from "../environment.js";
import { AbstractValue, ConcreteValue, EmptyValue, Value } from "../values/index.js";
import { Reference } from "../environment.js";
import { GetValue, joinEffects, ToBoolean, UpdateEmpty } from "../methods/index.js";
import type { BabelNode, BabelNodeIfStatement } from "babel-types";
import invariant from "../invariant.js";

export function evaluate (
    ast: BabelNodeIfStatement, strictCode: boolean, env: LexicalEnvironment,
    realm: Realm): Completion | Value | Reference {
  // 1. Let exprRef be the result of evaluating Expression
  let exprRef = env.evaluate(ast.test, strictCode);
  // 2. Let exprValue be ToBoolean(? GetValue(exprRef))
  let exprValue = GetValue(realm, exprRef);

  let stmtCompletion = EmptyValue;
  if (exprValue instanceof ConcreteValue) {
    if (ToBoolean(realm, exprValue)) {
      // 3.a. Let stmtCompletion be the result of evaluating the first Statement
      stmtCompletion = env.evaluate(ast.consequent, strictCode);
    } else {
      if (ast.alternate)
        // 4.a. Let stmtCompletion be the result of evaluating the second Statement
        stmtCompletion = env.evaluate(ast.alternate, strictCode);
      else
        // 3 (of the if only statement). Return NormalCompletion(undefined)
        return realm.intrinsics.undefined;
    }
    // 5. Return Completion(UpdateEmpty(stmtCompletion, undefined)
    if (stmtCompletion instanceof Reference)
      return stmtCompletion;
    return UpdateEmpty(realm, stmtCompletion, realm.intrinsics.undefined);
  }
  invariant(exprValue instanceof AbstractValue);

  if (!exprValue.mightNotBeObject()) {
    return env.evaluate(ast.consequent, strictCode);
  } else {
    return evaluateWithAbstractConditional(exprValue, ast.consequent, ast.alternate, strictCode, env, realm);
  }
}

export function evaluateWithAbstractConditional(condValue: AbstractValue,
    consequent: BabelNode, alternate: ?BabelNode, strictCode: boolean,
    env: LexicalEnvironment, realm: Realm): NormalCompletion | Value | Reference {
  // Evaluate consequent and alternate in sandboxes and get their effects.
  let [compl1, gen1, bindings1, properties1, createdObj1] =
    realm.partially_evaluate(consequent, strictCode, env);

  let [compl2, gen2, bindings2, properties2, createdObj2] =
    alternate ?
      realm.partially_evaluate(alternate, strictCode, env) :
      construct_empty_effects(realm);

  // Join the effects, creating an abstract view of what happened, regardless
  // of the actual value of condValue.
  let [completion, generator, bindings, properties, createdObjects] =
    joinEffects(realm, condValue,
      [compl1, gen1, bindings1, properties1, createdObj1],
      [compl2, gen2, bindings2, properties2, createdObj2]);

  // Apply the joined effects to the global state
  realm.restoreBindings(bindings);
  realm.restoreProperties(properties);

  // Add generated code for property modifications
  let realmGenerator = realm.generator;
  invariant(realmGenerator);
  let realmGeneratorBody = realmGenerator.body;
  generator.body.forEach((v, k, a) => realmGeneratorBody.push(v));

  // Ignore created Objects
  createdObjects;

  // return or throw completion
  if (completion instanceof AbruptCompletion)
    throw completion;
  invariant(completion instanceof NormalCompletion || completion instanceof Value || completion instanceof Reference);
  return completion;

}
