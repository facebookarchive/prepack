/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { CompilerState } from "../CompilerState.js";
import type { BabelNodeStatement } from "@babel/types";

import invariant from "../../invariant.js";
import { CompilerDiagnostic, FatalError } from "../../errors.js";
import { IRBuilder } from "llvm-node";

import { buildFromExpression } from "./Expression.js";

export function buildFromStatement(state: CompilerState, statement: BabelNodeStatement, builder: IRBuilder): void {
  switch (statement.type) {
    case "ExpressionStatement": {
      buildFromExpression(state, statement.expression, builder);
      return;
    }
    case "VariableDeclaration": {
      // Derived values create temporary variables in the generator. That's unfortunate.
      for (let decl of statement.declarations) {
        let id = decl.id;
        invariant(id.type === "Identifier", "variable declarations must use identifiers");
        invariant(!state.declaredVariables.has(id.name), "redeclaration of identifier: " + id.name);
        let init = decl.init;
        invariant(init);
        let value = buildFromExpression(state, init, builder);
        state.declaredVariables.set(id.name, value);
      }
      return;
    }
    case "ReturnStatement": {
      let argument = statement.argument;
      if (argument) {
        builder.createRet(buildFromExpression(state, argument, builder));
        return;
      }
      builder.createRetVoid();
      return;
    }
    default: {
      let error = new CompilerDiagnostic(
        `Unsupported statement type "${statement.type}" in the LLVM backend.`,
        statement.loc,
        "PP2000",
        "FatalError"
      );
      state.realm.handleError(error);
      throw new FatalError();
    }
  }
}
