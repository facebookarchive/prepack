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
import { Value as LLVMValue, BasicBlock, IRBuilder } from "llvm-node";
import { Value, NumberValue, IntegralValue } from "../../values/index.js";
import { llvmContext } from "../llvm-context.js";
import * as t from "@babel/types";

import { buildFromValue } from "./Value.js";

export function valueToExpression(value: Value): BabelNodeExpression {
  // Hack. We use an identifier to hold the LLVM value so that
  // we can represent the value in the Babel representation.
  let identifier = t.identifier("LLVM_VALUE");
  // Decorators is an unused any field so we can reuse that.
  identifier.decorators = value;
  return identifier;
}

function valueFromExpression(expr: BabelNodeExpression): Value {
  invariant(expr.type === "Identifier" && expr.name === "LLVM_VALUE" && expr.decorators);
  return (expr.decorators: Value);
}

function buildFromBinaryExpression(
  state: CompilerState,
  expr: BabelNodeBinaryExpression,
  builder: IRBuilder
): LLVMValue {
  let leftValue = valueFromExpression(expr.left);
  let rightValue = valueFromExpression(expr.right);
  let left = buildFromValue(state, leftValue, builder);
  let right = buildFromValue(state, rightValue, builder);
  let type = leftValue.getType();
  if (type !== rightValue.getType()) {
    let error = new CompilerDiagnostic(
      `Cannot apply the ${expr.operator} operator to values of different types.`,
      expr.loc,
      "PP2000",
      "FatalError"
    );
    state.realm.handleError(error);
    throw new FatalError();
  }
  switch (expr.operator) {
    case "==":
    case "===": {
      if (type === IntegralValue) {
        return builder.createICmpEQ(left, right);
      } else if (type === NumberValue) {
        return builder.createFCmpOEQ(left, right);
      } else {
        let error = new CompilerDiagnostic(
          `The equality operator for ${type.name} is not yet implemented for LLVM.`,
          expr.loc,
          "PP2000",
          "FatalError"
        );
      }
    }
    case "!=":
    case "!==": {
      if (type === IntegralValue) {
        return builder.createICmpNE(left, right);
      } else if (type === NumberValue) {
        return builder.createFCmpONE(left, right);
      } else {
        let error = new CompilerDiagnostic(
          `The equality operator for ${type.name} is not yet implemented for LLVM.`,
          expr.loc,
          "PP2000",
          "FatalError"
        );
      }
    }
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
    case ">":
    case "<":
    case ">=":
    case "<=":
      let error = new CompilerDiagnostic(
        `The ${expr.operator} operator is not yet implemented for LLVM.`,
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
        return buildFromValue(state, (expr.decorators: Value), builder);
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
    case "ConditionalExpression": {
      let condition = buildFromExpression(state, expr.test, builder);
      let consequentValue = buildFromExpression(state, expr.consequent, builder);
      let alternateValue = buildFromExpression(state, expr.alternate, builder);
      invariant(consequentValue.type.equals(alternateValue.type));
      return builder.createSelect(condition, consequentValue, alternateValue);
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
