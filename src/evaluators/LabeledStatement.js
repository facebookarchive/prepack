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
import type { Value } from "../values/index.js";
import { StringValue } from "../values/index.js";
import type { Reference } from "../environment.js";
import { BreakCompletion, ThrowCompletion } from "../completions.js";
import { Construct } from "../methods/construct.js";
import type { BabelNodeLabeledStatement, BabelNode } from "babel-types";

// ECMA262 13.13.14
function LabelledEvaluation(labelSet: Array<string>, ast: BabelNode, strictCode: boolean, env: LexicalEnvironment, realm: Realm): Value | Reference {
  // LabelledStatement:LabelIdentifier:LabelledItem
  switch (ast.type) {
    case 'LabeledStatement':
      let labeledAst = ((ast: any): BabelNodeLabeledStatement);
      // 1. Let label be the StringValue of LabelIdentifier.
      let label = labeledAst.label.name;

      // 2. Append label as an element of labelSet.
      labelSet.push(label);

      // 3. Let stmtResult be LabelledEvaluation of LabelledItem with argument labelSet.
      let normalCompletionStmtResult;
      try {
        normalCompletionStmtResult = LabelledEvaluation(labelSet, labeledAst.body, strictCode, env, realm);
      } catch (stmtResult) {
        // 4. If stmtResult.[[Type]] is break and SameValue(stmtResult.[[Target]], label) is true, then
        if (stmtResult instanceof BreakCompletion && stmtResult.target === label) {
          // a. Let stmtResult be NormalCompletion(stmtResult.[[Value]]).
          normalCompletionStmtResult = stmtResult.value;
        } else {
          // 5. Return Completion(stmtResult).
          throw stmtResult;
        }
      }
      // 5. Return Completion(stmtResult).
      return normalCompletionStmtResult;

    case 'VariableDeclaration':
      if (ast.kind === 'var') {
        return env.evaluate(ast, strictCode);
      }
      // fall through to throw
    case 'FunctionDeclaration':
    case 'ClassDeclaration':
      throw new ThrowCompletion(
        Construct(realm, realm.intrinsics.SyntaxError,
           [new StringValue(realm, ast.type + " may not have a label")])
      );

    default:
      return env.evaluate(ast, strictCode, labelSet);
  }
}

// ECMA262 13.13.15
export default function (ast: BabelNodeLabeledStatement, strictCode: boolean, env: LexicalEnvironment, realm: Realm): Value | Reference {
  //1. Let newLabelSet be a new empty List.
  let newLabelSet = [];

  //2. Return LabelledEvaluation of this LabelledStatement with argument newLabelSet.
  return LabelledEvaluation(newLabelSet, ast, strictCode, env, realm);
}
