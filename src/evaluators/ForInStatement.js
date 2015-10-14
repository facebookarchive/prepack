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
import type { Value } from "../values/index.js";
import type { LexicalEnvironment, Reference } from "../environment.js";
import { ForInOfHeadEvaluation, ForInOfBodyEvaluation } from "./ForOfStatement.js";
import { BoundNames } from "../methods/index.js";
import type { BabelNodeForInStatement } from "babel-types";

// ECMA262 13.7.5.11
export default function (ast: BabelNodeForInStatement, strictCode: boolean, env: LexicalEnvironment, realm: Realm, labelSet: ?Array<string>): Value | Reference {
  let { left, right, body } = ast;

  if (left.type === "VariableDeclaration") {
    if (left.kind === "var") { // for (var ForBinding in Expression) Statement
      // 1. Let keyResult be ? ForIn/OfHeadEvaluation(« », Expression, enumerate).
      let keyResult = ForInOfHeadEvaluation(realm, env, [], right, "enumerate", strictCode);

      // 2. Return ? ForIn/OfBodyEvaluation(ForBinding, Statement, keyResult, varBinding, labelSet).
      return ForInOfBodyEvaluation(realm, env, left.declarations[0].id, body, keyResult, "varBinding", labelSet, strictCode);
    } else { // for (ForDeclaration in Expression) Statement
      // 1. Let keyResult be the result of performing ? ForIn/OfHeadEvaluation(BoundNames of ForDeclaration, Expression, enumerate).
      let keyResult = ForInOfHeadEvaluation(realm, env, BoundNames(realm, left), right, "enumerate", strictCode);

      // 2. Return ? ForIn/OfBodyEvaluation(ForDeclaration, Statement, keyResult, lexicalBinding, labelSet).
      return ForInOfBodyEvaluation(realm, env, left, body, keyResult, "lexicalBinding", labelSet, strictCode);
    }
  } else { // for (LeftHandSideExpression in Expression) Statement
    // 1. Let keyResult be ? ForIn/OfHeadEvaluation(« », Expression, enumerate).
    let keyResult = ForInOfHeadEvaluation(realm, env, [], right, "enumerate", strictCode);

    // 2. Return ? ForIn/OfBodyEvaluation(LeftHandSideExpression, Statement, keyResult, assignment, labelSet).
    return ForInOfBodyEvaluation(realm, env, left, body, keyResult, "assignment", labelSet, strictCode);
  }
}
