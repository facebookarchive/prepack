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
import type { BabelNodeExpression, BabelNodeBinaryExpression, BabelNodeUnaryExpression } from "@babel/types";

import invariant from "../../invariant.js";
import { CompilerDiagnostic, FatalError } from "../../errors.js";
import { Value as LLVMValue, Type as LLVMType, Constant, ConstantInt, IRBuilder } from "llvm-node";
import { llvmContext } from "../llvm-context.js";
import { Value } from "../../values/index.js";
import * as t from "@babel/types";

import { buildFromValue } from "./Value.js";
import { buildAppendString, buildCompareString, getStringPtr } from "./StringValue.js";
import { buildToBoolean, buildToInt32, buildToUint32, buildToNumber, buildToString } from "./To.js";

export function valueToExpression(value: Value): BabelNodeExpression {
  // Hack. We use an identifier to hold the LLVM value so that
  // we can represent the value in the Babel representation.
  let identifier = t.identifier("LLVM_VALUE");
  // Decorators is an unused any field so we can reuse that.
  identifier.decorators = value;
  return identifier;
}

function buildStrictEquality(
  state: CompilerState,
  x: LLVMValue,
  y: LLVMValue,
  comparison: "eq" | "ne",
  builder: IRBuilder
) {
  invariant(
    x.type.equals(y.type),
    "strict equality should only be done on the same type, otherwise it is always false"
  );
  if (x.type.isIntegerTy(1)) {
    // Boolean
    return comparison === "eq" ? builder.createICmpEQ(x, y) : builder.createICmpNE(x, y);
  } else if (x.type.isDoubleTy()) {
    // Number
    return comparison === "eq" ? builder.createFCmpOEQ(x, y) : builder.createFCmpONE(x, y);
  } else if (x.type.isIntegerTy(32)) {
    // Integral
    return comparison === "eq" ? builder.createICmpEQ(x, y) : builder.createICmpNE(x, y);
  } else if (state.intrinsics.isUint32Type(x.type)) {
    // Unsigned Integral
    return comparison === "eq" ? builder.createICmpEQ(x, y) : builder.createICmpNE(x, y);
  } else if (state.intrinsics.isStringType(x.type)) {
    // String
    return buildCompareString(state, x, y, comparison, builder);
  } else {
    invariant(false);
  }
}

function isNumericType(state: CompilerState, type: LLVMType) {
  return type.isDoubleTy() || type.isIntegerTy(32) || state.intrinsics.isUint32Type(type);
}

function buildAbstractEquality(
  state: CompilerState,
  x: LLVMValue,
  y: LLVMValue,
  comparison: "eq" | "ne",
  builder: IRBuilder
) {
  // 1. If Type(x) is the same as Type(y), then
  if (x.type.equals(y.type)) {
    // a. Return the result of performing Strict Equality Comparison x === y.
    return buildStrictEquality(state, x, y, comparison, builder);
  }

  if (isNumericType(state, x.type) && isNumericType(state, y.type)) {
    // If both are numbers but different numeric types, we convert them
    // both to doubles for comparison since that preserves the shared precision.
    return buildStrictEquality(
      state,
      buildToNumber(state, x, builder),
      buildToNumber(state, y, builder),
      comparison,
      builder
    );
  }

  let xIsNull = x instanceof Constant && x.isNullValue();
  let yIsNull = y instanceof Constant && y.isNullValue();

  // 2. If x is null and y is undefined, return true.
  invariant(!xIsNull || !y.type.isVoidTy(), "should have been constant folded by the interpreter");

  // 3. If x is undefined and y is null, return true.
  invariant(!x.type.isVoidTy() || !yIsNull, "should have been constant folded by the interpreter");

  // 4. If Type(x) is Number and Type(y) is String, return the result of the comparison x == ToNumber(y).
  if (isNumericType(state, x.type) && state.intrinsics.isStringType(y.type)) {
    // We convert any integers to the double representation for comparison.
    return buildAbstractEquality(
      state,
      buildToNumber(state, x, builder),
      buildToNumber(state, y, builder),
      comparison,
      builder
    );
  }

  // 5. If Type(x) is String and Type(y) is Number, return the result of the comparison ToNumber(x) == y.
  if (state.intrinsics.isStringType(x.type) && isNumericType(state, y.type)) {
    // We convert any integers to the double representation for comparison.
    return buildAbstractEquality(
      state,
      buildToNumber(state, x, builder),
      buildToNumber(state, y, builder),
      comparison,
      builder
    );
  }

  // 6. If Type(x) is Boolean, return the result of the comparison ToNumber(x) == y.
  if (x.type.isIntegerTy(1)) {
    return buildAbstractEquality(state, buildToNumber(state, x, builder), x, comparison, builder);
  }

  // 7. If Type(y) is Boolean, return the result of the comparison x == ToNumber(y).
  if (y.type.isIntegerTy(1)) {
    return buildAbstractEquality(state, x, buildToNumber(state, y, builder), comparison, builder);
  }

  // 8. If Type(x) is either String, Number, or Symbol and Type(y) is Object, return the result of the comparison x == ToPrimitive(y).
  // 9. If Type(x) is Object and Type(y) is either String, Number, or Symbol, return the result of the comparison ToPrimitive(x) == y.
  invariant(false, "objects should have been resolved to primitives.");
}

function buildAbstractRelationalComparison(
  state: CompilerState,
  x: LLVMValue,
  y: LLVMValue,
  comparison: ">" | "<" | ">=" | "<=",
  builder: IRBuilder
) {
  // TODO: implement
  invariant(false, "TODO: implement abstract relational comparison");
}

function buildFromBinaryExpression(
  state: CompilerState,
  expr: BabelNodeBinaryExpression,
  builder: IRBuilder
): LLVMValue {
  let left = buildFromExpression(state, expr.left, builder);
  let right = buildFromExpression(state, expr.right, builder);
  switch (expr.operator) {
    case "===":
    case "==": {
      // The interpreter will have simplified this if they are different types.
      // We still need to coerce the different numeric types, so we end up with
      // the same semantics as abstract equality.
      return buildAbstractEquality(state, left, right, "eq", builder);
    }
    case "!==":
    case "!=": {
      return buildAbstractEquality(state, left, right, "ne", builder);
    }
    case ">":
    case "<":
    case ">=":
    case "<=": {
      return buildAbstractRelationalComparison(state, left, right, expr.operator, builder);
    }
    case "+": {
      if (state.intrinsics.isStringType(left.type) || state.intrinsics.isStringType(right.type)) {
        let leftStr = buildToString(state, left, builder);
        let rightStr = buildToString(state, right, builder);
        return buildAppendString(state, leftStr, rightStr, builder);
      }
      // TODO: Keep Integral type if wrapped by conversion back to integral? See asm.js
      let leftNum = buildToNumber(state, left, builder);
      let rightNum = buildToNumber(state, right, builder);
      return builder.createFAdd(leftNum, rightNum);
    }
    case "-": {
      // TODO: Keep Integral type?
      let leftNum = buildToNumber(state, left, builder);
      let rightNum = buildToNumber(state, right, builder);
      return builder.createFSub(leftNum, rightNum);
    }
    case "/": {
      // TODO: Keep Integral type if wrapped by conversion back to integral? See asm.js
      let leftNum = buildToNumber(state, left, builder);
      let rightNum = buildToNumber(state, right, builder);
      return builder.createFDiv(leftNum, rightNum);
    }
    case "%": {
      // TODO: Keep Integral type?
      let leftNum = buildToNumber(state, left, builder);
      let rightNum = buildToNumber(state, right, builder);
      return builder.createFRem(leftNum, rightNum);
    }
    case "*": {
      // TODO: Keep Integral type if wrapped by conversion back to integral? See asm.js
      let leftNum = buildToNumber(state, left, builder);
      let rightNum = buildToNumber(state, right, builder);
      return builder.createFMul(leftNum, rightNum);
    }
    case "**": {
      // TODO: Keep Integral type if wrapped by conversion back to integral? See asm.js
      let leftNum = buildToNumber(state, left, builder);
      let rightNum = buildToNumber(state, right, builder);
      return builder.createCall(state.intrinsics.pow, [leftNum, rightNum]);
    }
    case "&": {
      let leftInt = buildToInt32(state, left, builder);
      let rightInt = buildToInt32(state, right, builder);
      return builder.createAnd(leftInt, rightInt);
    }
    case "|": {
      let leftInt = buildToInt32(state, left, builder);
      let rightInt = buildToInt32(state, right, builder);
      return builder.createOr(leftInt, rightInt);
    }
    case "^": {
      let leftInt = buildToInt32(state, left, builder);
      let rightInt = buildToInt32(state, right, builder);
      return builder.createXor(leftInt, rightInt);
    }
    case ">>>": {
      let leftInt = builder.createExtractValue(buildToUint32(state, left, builder), [0]);
      let rightInt = builder.createExtractValue(buildToUint32(state, right, builder), [0]);
      let maskedRightInt = builder.createAnd(rightInt, ConstantInt.get(llvmContext, 0x1f));
      return builder.createLShr(leftInt, maskedRightInt);
    }
    case ">>": {
      let leftInt = buildToInt32(state, left, builder);
      let rightInt = builder.createExtractValue(buildToUint32(state, right, builder), [0]);
      let maskedRightInt = builder.createAnd(rightInt, ConstantInt.get(llvmContext, 0x1f));
      return builder.createAShr(leftInt, maskedRightInt);
    }
    case "<<": {
      let leftInt = buildToInt32(state, left, builder);
      let rightInt = builder.createExtractValue(buildToUint32(state, right, builder), [0]);
      let maskedRightInt = builder.createAnd(rightInt, ConstantInt.get(llvmContext, 0x1f));
      return builder.createShl(leftInt, maskedRightInt);
    }
    default: {
      let error = new CompilerDiagnostic(
        `The ${expr.operator} operator is not supported for LLVM.`,
        expr.loc,
        "PP2000",
        "FatalError"
      );
      state.realm.handleError(error);
      throw new FatalError();
    }
  }
}

function buildFromUnaryExpression(state: CompilerState, expr: BabelNodeUnaryExpression, builder: IRBuilder): LLVMValue {
  let value = buildFromExpression(state, expr.argument, builder);
  switch (expr.operator) {
    case "+": {
      // TODO: Keep Integral type?
      return buildToNumber(state, value, builder);
    }
    case "-": {
      // TODO: Keep Integral type?
      return builder.createFNeg(buildToNumber(state, value, builder));
    }
    case "~": {
      return builder.createNot(buildToInt32(state, value, builder));
    }
    case "!": {
      return builder.createNot(buildToBoolean(state, value, builder));
    }
    default: {
      let error = new CompilerDiagnostic(
        `The ${expr.operator} operator is not supported for LLVM.`,
        expr.loc,
        "PP2000",
        "FatalError"
      );
      state.realm.handleError(error);
      throw new FatalError();
    }
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
        let val = buildFromExpression(state, arg, builder);
        if (state.intrinsics.isStringType(val.type)) {
          // For strings we unwrap the ptr and only pass the pointer
          // not the length. The length has to be passed to the FFI
          // manually.
          return getStringPtr(val, builder);
        }
        // TODO: If we make function arguments typed, we'll need to start typing the kind of
        // null pointer passed as the argument here if it can be null.
        return val;
      });
      return builder.createCall(callee, args);
    }
    case "BinaryExpression": {
      return buildFromBinaryExpression(state, expr, builder);
    }
    case "UnaryExpression": {
      return buildFromUnaryExpression(state, expr, builder);
    }
    case "LogicalExpression": {
      let left = buildFromExpression(state, expr.left, builder);
      let right = buildFromExpression(state, expr.right, builder);
      if (!left.type.equals(right.type)) {
        let error = new CompilerDiagnostic(
          `Logical operators must result in the same type in the LLVM backend.`,
          expr.loc,
          "PP2000",
          "FatalError"
        );
        state.realm.handleError(error);
        throw new FatalError();
      }
      let condition = buildToBoolean(state, left, builder);
      if (expr.operator === "&&") {
        return builder.createSelect(condition, right, left);
      } else {
        invariant(expr.operator === "||");
        return builder.createSelect(condition, left, right);
      }
    }
    case "ConditionalExpression": {
      let condition = buildToBoolean(state, buildFromExpression(state, expr.test, builder), builder);
      let consequentValue = buildFromExpression(state, expr.consequent, builder);
      let alternateValue = buildFromExpression(state, expr.alternate, builder);
      if (!consequentValue.type.equals(alternateValue.type)) {
        let error = new CompilerDiagnostic(
          `Conditions must result in the same type in the LLVM backend.`,
          expr.loc,
          "PP2000",
          "FatalError"
        );
        state.realm.handleError(error);
        throw new FatalError();
      }
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
