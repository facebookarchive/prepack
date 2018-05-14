/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { LexicalEnvironment } from "../environment.js";
import { AbruptCompletion } from "../completions.js";
import { AbstractValue, ConcreteValue, Value } from "../values/index.js";
import { Reference } from "../environment.js";
import { construct_empty_effects } from "../realm.js";
import { Environment, To } from "../singletons.js";
import type { BabelNodeConditionalExpression } from "babel-types";
import invariant from "../invariant.js";
import type { Realm } from "../realm.js";

export default function(
  ast: BabelNodeConditionalExpression,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): Value | Reference {
  let exprRef = env.evaluate(ast.test, strictCode);
  let exprValue = Environment.GetConditionValue(realm, exprRef);

  if (exprValue instanceof ConcreteValue) {
    if (To.ToBoolean(realm, exprValue)) {
      return env.evaluate(ast.consequent, strictCode);
    } else {
      return env.evaluate(ast.alternate, strictCode);
    }
  }
  invariant(exprValue instanceof AbstractValue);

  const consequent = ast.consequent;
  const alternate = ast.alternate;
  if (!exprValue.mightNotBeTrue()) return env.evaluate(consequent, strictCode);
  if (!exprValue.mightNotBeFalse()) return env.evaluate(alternate, strictCode);
  return AbstractValue.evaluateWithAbstractConditional(
    realm,
    exprValue,
    () => {
      return realm.evaluateNodeForEffects(consequent, strictCode, env);
    },
    () => {
      let completion = env.evaluateCompletionDeref(alternate, strictCode);
      if (completion instanceof AbruptCompletion) {
        throw completion;
      }
      return completion;
    },
    () => {
      return alternate ? realm.evaluateNodeForEffects(alternate, strictCode, env) : construct_empty_effects(realm);
    },
    () => {
      let completion = env.evaluateCompletionDeref(consequent, strictCode);
      if (completion instanceof AbruptCompletion) {
        throw completion;
      }
      return completion;
    }
  );
}
