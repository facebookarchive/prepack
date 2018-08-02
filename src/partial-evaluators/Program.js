/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { BabelNodeProgram, BabelNodeStatement, BabelNodeModuleDeclaration } from "@babel/types";
import type { LexicalEnvironment } from "../environment.js";
import type { Realm } from "../realm.js";

import { Completion } from "../completions.js";
import { EmptyValue, Value } from "../values/index.js";
import { GlobalDeclarationInstantiation } from "../evaluators/Program.js";

import IsStrict from "../utils/strict.js";
import * as t from "@babel/types";

export default function(
  ast: BabelNodeProgram,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): [Completion | Value, BabelNodeProgram, Array<BabelNodeStatement>] {
  strictCode = IsStrict(ast);

  GlobalDeclarationInstantiation(realm, ast, env, strictCode);

  let partialBody: Array<BabelNodeStatement | BabelNodeModuleDeclaration> = [];
  let val;

  for (let node of ast.body) {
    if (node.type !== "FunctionDeclaration") {
      let [potentialVal, partialAst, nio] = env.partiallyEvaluateCompletionDeref(node, strictCode);
      for (let ioAst of nio) partialBody.push(ioAst);
      partialBody.push((partialAst: any));
      if (!(potentialVal instanceof EmptyValue)) val = potentialVal;
    } else {
      // TODO: this goes away once residual functions are partially evaluated.
      partialBody.push(node);
    }
  }

  // todo: compute a global fixed point by invoking each escaped (i.e. call back)
  // function with dummy arguments and joining their effects with the
  // global state until there is no invocation that causes further changes to
  // the global state.

  let result = val || realm.intrinsics.empty;
  return [result, t.program(partialBody, ast.directives), []];
}
