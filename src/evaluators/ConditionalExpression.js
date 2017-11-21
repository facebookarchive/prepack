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
import { AbstractValue, ConcreteValue, Value } from "../values/index.js";
import type { Reference } from "../environment.js";
import { evaluateWithAbstractConditional } from "./IfStatement.js";
import { ToBoolean } from "../methods/index.js";
import { Environment } from "../singletons.js";
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
    if (ToBoolean(realm, exprValue)) {
      return env.evaluate(ast.consequent, strictCode);
    } else {
      return env.evaluate(ast.alternate, strictCode);
    }
  }
  invariant(exprValue instanceof AbstractValue);

  if (!exprValue.mightNotBeTrue()) return env.evaluate(ast.consequent, strictCode);
  if (!exprValue.mightNotBeFalse()) return env.evaluate(ast.alternate, strictCode);
  return evaluateWithAbstractConditional(exprValue, ast.consequent, ast.alternate, strictCode, env, realm);
}
