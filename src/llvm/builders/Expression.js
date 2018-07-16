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
import type { BabelNodeExpression, BabelNodeBinaryExpression } from "@babel/types";

import invariant from "../../invariant.js";
import { CompilerDiagnostic, FatalError } from "../../errors.js";
import { Value as LLVMValue, IRBuilder } from "llvm-node";
import * as t from "@babel/types";

export function valueToExpression(llvmValue: LLVMValue): BabelNodeExpression {
  // Hack. We use an identifier to hold the LLVM value so that
  // we can represent the value in the Babel representation.
  let identifier = t.identifier("LLVM_VALUE");
  // Decorators is an unused any field so we can reuse that.
  identifier.decorators = llvmValue;
  return identifier;
}

function buildFromBinaryExpression(
  state: CompilerState,
  expr: BabelNodeBinaryExpression,
  builder: IRBuilder
): LLVMValue {
  switch (expr.operator) {
    case "==":
    case "===": {
      let left = buildFromExpression(state, expr.left, builder);
      let right = buildFromExpression(state, expr.right, builder);
      if (!left.type.equals(right.type)) {
        let error = new CompilerDiagnostic(
          "Cannot compare values of different types.",
          expr.loc,
          "PP2000",
          "FatalError"
        );
        state.realm.handleError(error);
        throw new FatalError();
      }
      return builder.createICmpEQ(left, right);
    }
    case "!=":
    case "!==":
    case "+":
    case "-":
    case "/":
    case "%":
    case "*":
    case "**":
    case "&":
    case "|":
    case ">>":
    case ">>>":
    case "<<":
    case "^":
    case "in":
    case "instanceof":
    case ">":
    case "<":
    case ">=":
    case "<=":
      let error = new CompilerDiagnostic(
        `The ${expr.operator} is not yet implemented for LLVM.`,
        expr.loc,
        "PP2000",
        "FatalError"
      );
      state.realm.handleError(error);
      throw new FatalError();
    default:
      invariant(false, "unknown operator: " + expr.operator);
  }
}

export function buildFromExpression(state: CompilerState, expr: BabelNodeExpression, builder: IRBuilder): LLVMValue {
  switch (expr.type) {
    case "Identifier": {
      if (expr.name === "LLVM_VALUE" && expr.decorators) {
        return (expr.decorators: LLVMValue);
      }
      let derivedValue = state.declaredVariables.get(expr.name);
      if (derivedValue) {
        return derivedValue;
      }
      let error = new CompilerDiagnostic(
        `Unsupported identifier "${expr.name}" in the LLVM backend.`,
        expr.loc,
        "PP2000",
        "FatalError"
      );
      state.realm.handleError(error);
      throw new FatalError();
    }
    case "CallExpression": {
      let callee = buildFromExpression(state, expr.callee, builder);
      let args = expr.arguments.map(arg => {
        invariant(arg.type !== "SpreadElement");
        return buildFromExpression(state, arg, builder);
      });
      return builder.createCall(callee, args);
    }
    case "BinaryExpression": {
      return buildFromBinaryExpression(state, expr, builder);
    }
    default: {
      let error = new CompilerDiagnostic(
        `Unsupported expression type "${expr.type}" in the LLVM backend.`,
        expr.loc,
        "PP2000",
        "FatalError"
      );
      state.realm.handleError(error);
      throw new FatalError();
    }
  }
}
