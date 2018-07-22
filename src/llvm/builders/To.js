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

import invariant from "../../invariant.js";
import { CompilerDiagnostic, FatalError } from "../../errors.js";
import { Value as LLVMValue, Type as LLVMType, ConstantInt, ConstantFP, IRBuilder, UndefValue } from "llvm-node";
import { llvmContext } from "../llvm-context.js";

import { buildFromStringValue, getStringLength } from "./StringValue.js";

export function buildToBoolean(state: CompilerState, value: LLVMValue, builder: IRBuilder): LLVMValue {
  if (value.type.isIntegerTy(1)) {
    // Boolean
    // Already boolean
    return value;
  } else if (value.type.isDoubleTy()) {
    // Number
    // NaN is false
    return builder.createFCmpONE(value, ConstantFP.get(llvmContext, 0));
  } else if (value.type.isIntegerTy(32)) {
    // Signed Integral
    return builder.createICmpNE(value, ConstantInt.get(llvmContext, 0));
  } else if (state.intrinsics.isUint32Type(value.type)) {
    // Unsigned Integral
    let unsignedValue = builder.createExtractValue(value, [0]);
    return builder.createICmpNE(unsignedValue, ConstantInt.get(llvmContext, 0));
  } else if (state.intrinsics.isStringType(value.type)) {
    // String
    // True of non-zero length.
    return builder.createICmpNE(getStringLength(value, builder), ConstantInt.get(llvmContext, 0));
  } else {
    invariant(false, "only string, boolean and numbers should need toBoolean");
  }
}

export function buildToNumber(state: CompilerState, value: LLVMValue, builder: IRBuilder): LLVMValue {
  if (value.type.isIntegerTy(1)) {
    // Boolean
    return builder.createSelect(value, ConstantFP.get(llvmContext, 1), ConstantFP.get(llvmContext, 0));
  } else if (value.type.isDoubleTy()) {
    // Number
    // Already a number
    return value;
  } else if (value.type.isIntegerTy(32)) {
    // Signed Integral
    return builder.createSIToFP(value, LLVMType.getDoubleTy(llvmContext));
  } else if (state.intrinsics.isUint32Type(value.type)) {
    // Unsigned Integral
    let unsignedValue = builder.createExtractValue(value, [0]);
    return builder.createUIToFP(unsignedValue, LLVMType.getDoubleTy(llvmContext));
  } else if (state.intrinsics.isStringType(value.type)) {
    // String
    // TODO: Call library function to parse a string.
    let error = new CompilerDiagnostic(
      `ToNumber from String is not yet implemented for LLVM.`,
      undefined,
      "PP2000",
      "FatalError"
    );
    state.realm.handleError(error);
    throw new FatalError();
  } else {
    invariant(false, "only string, boolean and numbers should need toNumber");
  }
}

export function buildToInt32(state: CompilerState, value: LLVMValue, builder: IRBuilder): LLVMValue {
  if (value.type.isIntegerTy(1)) {
    // Boolean
    return builder.createSelect(value, ConstantInt.get(llvmContext, 1), ConstantInt.get(llvmContext, 0));
  } else if (value.type.isDoubleTy()) {
    // Number
    // TODO: I think we can make this fewer instructions/faster by some clever bit manipulation.
    // If not, we should probably hoist this out into a library call instead of inline.
    // TODO: To use bitmanipulation we have to expose createTrunc and a few missing helpers in llvm-node.
    let isInfinityOrNaN = builder.createFCmpUEQ(value, ConstantFP.get(llvmContext, Infinity));
    let isNegativeInfinityOrNaN = builder.createFCmpUEQ(value, ConstantFP.get(llvmContext, -Infinity));
    let isInfiniteOrNaN = builder.createOr(isInfinityOrNaN, isNegativeInfinityOrNaN);
    let remainder = builder.createFRem(value, ConstantFP.get(llvmContext, Math.pow(2, 32)));
    return builder.createSelect(
      isInfiniteOrNaN,
      ConstantInt.get(llvmContext, 0),
      builder.createFPToSI(remainder, LLVMType.getInt32Ty(llvmContext))
    );
  } else if (value.type.isIntegerTy(32)) {
    // Signed Integral
    return value;
  } else if (state.intrinsics.isUint32Type(value.type)) {
    // Unsigned Integral
    let unsignedValue = builder.createExtractValue(value, [0]);
    // The bit representation is already correct so we just have to unpack it.
    return unsignedValue;
  } else {
    return buildToInt32(state, buildToNumber(state, value, builder), builder);
  }
}

export function buildToUint32(state: CompilerState, value: LLVMValue, builder: IRBuilder): LLVMValue {
  if (value.type.isIntegerTy(1)) {
    // Boolean
    return builder.createSelect(value, ConstantInt.get(llvmContext, 1), ConstantInt.get(llvmContext, 0));
  } else if (value.type.isDoubleTy()) {
    // Number
    // TODO: I think we can make this fewer instructions/faster by some clever bit manipulation.
    // If not, we should probably hoist this out into a library call instead of inline.
    // TODO: To use bitmanipulation we have to expose createTrunc and a few missing helpers in llvm-node.
    let isInfinityOrNaN = builder.createFCmpUEQ(value, ConstantFP.get(llvmContext, Infinity));
    let isNegativeInfinityOrNaN = builder.createFCmpUEQ(value, ConstantFP.get(llvmContext, -Infinity));
    let isInfiniteOrNaN = builder.createOr(isInfinityOrNaN, isNegativeInfinityOrNaN);
    let remainder = builder.createFRem(value, ConstantFP.get(llvmContext, Math.pow(2, 32)));
    let v = builder.createSelect(
      isInfiniteOrNaN,
      ConstantInt.get(llvmContext, 0),
      builder.createFPToSI(remainder, LLVMType.getInt32Ty(llvmContext))
    );
    // We wrap the value in a struct to keep track that this is an unsigned int
    // so that we know which operations to apply on this.
    let unsignedValue = UndefValue.get(state.intrinsics.uint32Type);
    return builder.createInsertValue(unsignedValue, v, [0]);
  } else if (value.type.isIntegerTy(32)) {
    // Integral
    // The bit representation is already correct. We just need to wrap the value
    // in a struct to keep track that this is an unsigned int so that we know
    // which operations to apply on this.
    let unsignedValue = UndefValue.get(state.intrinsics.uint32Type);
    return builder.createInsertValue(unsignedValue, value, [0]);
  } else if (state.intrinsics.isUint32Type(value.type)) {
    // Unsigned Integral
    return value;
  } else {
    return buildToInt32(state, buildToNumber(state, value, builder), builder);
  }
}

export function buildToString(state: CompilerState, value: LLVMValue, builder: IRBuilder): LLVMValue {
  if (value.type.isIntegerTy(1)) {
    // Boolean
    return builder.createSelect(
      value,
      buildFromStringValue(state, "true", builder),
      buildFromStringValue(state, "false", builder)
    );
  } else if (value.type.isIntegerTy(32) || value.type.isDoubleTy() || state.intrinsics.isUint32Type(value.type)) {
    // Number
    // TODO: Call library function to convert to a string.
    let error = new CompilerDiagnostic(
      `ToString is not yet implemented for numbers in LLVM.`,
      undefined,
      "PP2000",
      "FatalError"
    );
    state.realm.handleError(error);
    throw new FatalError();
  } else if (state.intrinsics.isStringType(value.type)) {
    // String
    return value;
  } else {
    invariant(false, "only string, boolean and numbers should need toString");
  }
}
