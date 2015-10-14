/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { NormalCompletion } from "../completions.js";
import type { LexicalEnvironment } from "../environment.js";
import { AbstractValue, ConcreteValue, Value } from "../values/index.js";
import type { Reference } from "../environment.js";
import { evaluateWithAbstractConditional } from "./IfStatement.js";
import { GetValue, ToBoolean } from "../methods/index.js";
import type { BabelNodeConditionalExpression } from "babel-types";
import invariant from "../invariant.js";
import type { Realm } from "../realm.js";

export default function (
    ast: BabelNodeConditionalExpression, strictCode: boolean,
    env: LexicalEnvironment, realm: Realm): NormalCompletion | Value | Reference {
  let exprRef = env.evaluate(ast.test, strictCode);
  let exprValue = GetValue(realm, exprRef);

  if (exprValue instanceof ConcreteValue) {
    if (ToBoolean(realm, exprValue)) {
      return env.evaluate(ast.consequent, strictCode);
    } else {
      return env.evaluate(ast.alternate, strictCode);
    }
  }
  invariant(exprValue instanceof AbstractValue);

  if (!exprValue.mightNotBeObject())
    return env.evaluate(ast.consequent, strictCode);
  else
    return evaluateWithAbstractConditional(exprValue, ast.consequent, ast.alternate, strictCode, env, realm);
}
