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
import type { BabelNodeClassExpression } from "@babel/types";
import { HasOwnProperty } from "../methods/index.js";
import { ClassDefinitionEvaluation } from "./ClassDeclaration";
import { Functions } from "../singletons.js";

// ECMA262 14.5.16
export default function(
  ast: BabelNodeClassExpression,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): Value {
  // 1. If BindingIdentifieropt is not present, let className be undefined.
  let className;
  // 2. Else, let className be StringValue of BindingIdentifier.
  if (ast.id != null) {
    className = ast.id.name;
  }
  // 3. Let value be the result of ClassDefinitionEvaluation of ClassTail with argument className.
  let value = ClassDefinitionEvaluation(realm, ast, className, strictCode, env);

  // 4. ReturnIfAbrupt(value).

  // 5. If className is not undefined, then
  if (className !== undefined) {
    // a. Let hasNameProperty be HasOwnProperty(value, "name").
    let hasNameProperty = HasOwnProperty(realm, value, "name");

    // b. ReturnIfAbrupt(hasNameProperty).

    // c. If hasNameProperty is false, then
    if (!hasNameProperty) {
      // i. Perform SetFunctionName(value, className).
      Functions.SetFunctionName(realm, value, className);
    }
  }

  // 6. Return NormalCompletion(value).
  return value;
}
