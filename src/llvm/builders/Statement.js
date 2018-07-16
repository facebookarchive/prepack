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
import type { Generator } from "../../utils/generator.js";

import invariant from "../../invariant.js";
import { CompilerDiagnostic, FatalError } from "../../errors.js";
import { llvmContext } from "../llvm-context.js";
import { IRBuilder, BasicBlock } from "llvm-node";

import { buildFromExpression } from "./Expression.js";
import { buildFromGenerator } from "./Generator.js";

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
    case "IfStatement": {
      let condition = buildFromExpression(state, statement.test, builder);
      let consequentStatement = statement.consequent;
      let alternateStatement = statement.alternate;
      invariant(
        consequentStatement.type === "BlockStatement" && (consequentStatement: any).generator,
        "expected to be a block wrapper"
      );
      let consequentGen: Generator = (consequentStatement: any).generator;
      let alternateGen: Generator;
      if (alternateStatement) {
        invariant(
          alternateStatement.type === "BlockStatement" && (alternateStatement: any).generator,
          "expected to be a block wrapper"
        );
        alternateGen = (alternateStatement: any).generator;
      } else {
        throw new Error("handle alternate block");
      }
      let parentFn = builder.getInsertBlock().parent;
      let consequentBlock = BasicBlock.create(llvmContext, "Then", parentFn);
      let alternateBlock = BasicBlock.create(llvmContext, "Else");
      let continueBlock = BasicBlock.create(llvmContext, "Cont");

      builder.createCondBr(condition, consequentBlock, alternateBlock);
      builder.setInsertionPoint(consequentBlock);
      buildFromGenerator(state, consequentGen, builder);
      builder.createBr(continueBlock);

      parentFn.addBasicBlock(alternateBlock);
      builder.setInsertionPoint(alternateBlock);
      buildFromGenerator(state, alternateGen, builder);
      builder.createBr(continueBlock);

      parentFn.addBasicBlock(continueBlock);
      builder.setInsertionPoint(continueBlock);
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
