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
import { Value, StringValue } from "../../values/index.js";
import {
  Value as LLVMValue,
  Type as LLVMType,
  ArrayType,
  Constant,
  ConstantArray,
  ConstantInt,
  ConstantStruct,
  UndefValue,
  PointerType,
  IRBuilder,
  GlobalVariable,
  LinkageTypes,
  config,
} from "llvm-node";
import { llvmContext } from "../llvm-context.js";

import { buildFromValue } from "./Value.js";

function allocString(state: CompilerState, size: LLVMValue, builder: IRBuilder): LLVMValue {
  // TODO: Move this to allocate in an arena allocated on the top of the stack.
  // This works right now because we inline literally everything to a single function but
  // when we start extracting helper functions, we'll need to be able to allocate in
  // that arena so that values can survive being returned from the function.
  return builder.createAlloca(LLVMType.getInt8Ty(llvmContext), size, "StringBuffer");
}

export function getStringPtr(value: LLVMValue, builder: IRBuilder) {
  return builder.createExtractValue(value, [0], "String.ptr");
}

function getStringLength(value: LLVMValue, builder: IRBuilder) {
  return builder.createExtractValue(value, [1], "String.byteLength");
}

function memcpy(state: CompilerState, dest: LLVMValue, src: LLVMValue, len: LLVMValue, builder: IRBuilder) {
  let args = [dest, src, len];
  if (config.LLVM_VERSION_MAJOR < 7) {
    args.push(ConstantInt.get(llvmContext, 0));
  }
  args.push(ConstantInt.getFalse(llvmContext));
  return builder.createCall(state.intrinsics.memcpy, args);
}

export function buildAppendString(state: CompilerState, left: Value, right: Value, builder: IRBuilder): LLVMValue {
  let lStr = buildFromValue(state, left, builder);
  let rStr = buildFromValue(state, right, builder);
  invariant(state.intrinsics.isStringType(lStr.type));
  invariant(state.intrinsics.isStringType(rStr.type));
  let lPtr = getStringPtr(lStr, builder);
  let rPtr = getStringPtr(rStr, builder);
  let lLength = getStringLength(lStr, builder);
  let rLength = getStringLength(rStr, builder);
  let newLength = builder.createAdd(lLength, rLength, "NewString.byteLength");
  let newPtr = allocString(state, newLength, builder);
  memcpy(state, newPtr, lPtr, lLength, builder);
  let newOffset = builder.createInBoundsGEP(newPtr, [lLength]);
  memcpy(state, newOffset, rPtr, rLength, builder);
  let newStr = UndefValue.get(state.intrinsics.stringType);
  newStr = builder.createInsertValue(newStr, newPtr, [0]);
  newStr = builder.createInsertValue(newStr, newLength, [1]);
  return newStr;
}

function byte(n: number) {
  return ConstantInt.get(llvmContext, n, 8, false);
}

function convertUCS2ToUTF8ConstantArray(string) {
  let elements = [];
  for (let i = 0; i < string.length; i++) {
    let charCode = string.charCodeAt(i);
    if (charCode < 0x80) {
      elements.push(byte(charCode | 0));
    } else if (charCode < 0x800) {
      elements.push(byte((charCode >> 6) | 0xc0), byte((charCode & 0x3f) | 0x80));
    } else if (charCode < 0xffff) {
      elements.push(
        byte((charCode >> 12) | 0xe0),
        byte(((charCode >> 6) & 0x3f) | 0x80),
        byte((charCode & 0x3f) | 0x80)
      );
    } else {
      elements.push(
        byte(0xf0 | (charCode >> 18)),
        byte(0x80 | ((charCode >> 12) & 0x3f)),
        byte(0x80 | ((charCode >> 6) & 0x3f)),
        byte(0x80 | (charCode & 0x3f))
      );
    }
  }
  return elements;
}

export function buildFromStringValue(state: CompilerState, value: StringValue, builder: IRBuilder): LLVMValue {
  let stringValue = value.value;
  let existingString = state.internedStrings.get(stringValue);
  if (existingString === undefined) {
    let elements = convertUCS2ToUTF8ConstantArray(stringValue);
    let arrayType = ArrayType.get(LLVMType.getInt8Ty(llvmContext), elements.length);
    // Convert to UTF8 string without null termination.
    let data = ConstantArray.get(arrayType, elements);
    // TODO: llvm-node should support passing through the false flag to getString to avoid null terminated strings.
    // let data = ConstantDataArray.getString(llvmContext, stringValue, false);

    // Hoist to the top and refer to the shared string.
    existingString = new GlobalVariable(state.module, arrayType, true, LinkageTypes.PrivateLinkage, data);

    state.internedStrings.set(stringValue, existingString);
  }
  let ptr = builder.createInBoundsGEP(existingString, [
    ConstantInt.get(llvmContext, 0),
    ConstantInt.get(llvmContext, 0),
  ]);
  invariant(existingString.type instanceof PointerType && existingString.type.elementType instanceof ArrayType);
  let length = ConstantInt.get(llvmContext, existingString.type.elementType.numElements, 32, false);
  invariant(ptr instanceof Constant);
  return ConstantStruct.get(state.intrinsics.stringType, [ptr, length]);
}
