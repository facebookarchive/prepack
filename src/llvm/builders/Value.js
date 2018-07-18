/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { BabelNodeSourceLocation } from "@babel/types";
import type { CompilerState } from "../CompilerState.js";

import invariant from "../../invariant.js";
import { CompilerDiagnostic, FatalError } from "../../errors.js";
import {
  Value as LLVMValue,
  ConstantInt,
  ConstantFP,
  Function as LLVMFunction,
  FunctionType,
  Type as LLVMType,
  LinkageTypes,
  IRBuilder,
} from "llvm-node";
import {
  Value,
  AbstractValue,
  AbstractObjectValue,
  BooleanValue,
  NumberValue,
  IntegralValue,
  StringValue,
  UndefinedValue,
  NullValue,
  EmptyValue,
  ObjectValue,
  FunctionValue,
  SymbolValue,
} from "../../values/index.js";
import { llvmContext } from "../llvm-context.js";

import { buildFromExpression, valueToExpression } from "./Expression.js";

export function getType(
  state: CompilerState,
  type: typeof Value,
  expressionLocation?: ?BabelNodeSourceLocation
): LLVMType {
  if (type === Value) {
    let error = new CompilerDiagnostic(
      "The type of this expression is not known or has multiple types.",
      expressionLocation,
      "PP2000",
      "FatalError"
    );
    state.realm.handleError(error);
    throw new FatalError();
  } else if (type === BooleanValue) {
    return LLVMType.getInt1Ty(llvmContext);
  } else if (type === UndefinedValue) {
    return LLVMType.getVoidTy(llvmContext);
  } else if (type === NullValue) {
    invariant(false, "null value has to be determined at the call site");
  } else if (type === NumberValue) {
    return LLVMType.getDoubleTy(llvmContext);
  } else if (type === IntegralValue) {
    return LLVMType.getInt32Ty(llvmContext);
  } else if (type === StringValue) {
    let error = new CompilerDiagnostic(
      "String types are not yet supported.",
      expressionLocation,
      "PP2000",
      "FatalError"
    );
    state.realm.handleError(error);
    throw new FatalError();
  } else if (type === SymbolValue) {
    let error = new CompilerDiagnostic(
      "Symbol types are not yet supported.",
      expressionLocation,
      "PP2000",
      "FatalError"
    );
    state.realm.handleError(error);
    throw new FatalError();
  } else if (type === EmptyValue) {
    invariant(false, "since we are not serializing objects we should not need empty value");
  } else {
    invariant(false, "unknown type");
  }
}

function buildFromAbstractValue(state: CompilerState, value: AbstractValue, builder: IRBuilder): LLVMValue {
  let serializedArgs;
  try {
    serializedArgs = value.args.map((abstractArg, i) => valueToExpression(abstractArg));
  } catch (x) {
    if (x instanceof FatalError) {
      // Emit an additional compiler diagnostic for the location where
      // the operation leaked.
      let error = new CompilerDiagnostic(
        "This operation has dynamic arguments not supported by the LLVM backend.",
        value.expressionLocation,
        "PP2000",
        "FatalError"
      );
      state.realm.handleError(error);
    }
    throw new FatalError();
  }
  let expression = value.buildNode(serializedArgs);
  return buildFromExpression(state, expression, builder);
}

function buildFromIntrinsicFunctionValue(state: CompilerState, value: Value, builder: IRBuilder): LLVMValue {
  let intrinsicName = value.intrinsicName;
  invariant(intrinsicName);
  invariant(value instanceof AbstractObjectValue, "only abstract functions should be serialized");
  let returnType = getType(state, value.functionResultType || Value, value.expressionLocation);
  let fnType = FunctionType.get(returnType, true);
  let fn = LLVMFunction.create(fnType, LinkageTypes.ExternalLinkage, intrinsicName, state.module);
  return fn;
}

function buildFromIntrinsicValue(state: CompilerState, value: Value, builder: IRBuilder): LLVMValue {
  if (Value.isTypeCompatibleWith(value.getType(), FunctionValue)) {
    return buildFromIntrinsicFunctionValue(state, value, builder);
  }
  let intrinsicName = value.intrinsicName;
  invariant(intrinsicName);
  let derivedValue = state.declaredVariables.get(intrinsicName);
  if (derivedValue) {
    return derivedValue;
  }

  let error = new CompilerDiagnostic(
    "Unsupported intrinsic value type in the LLVM backend.",
    value.expressionLocation,
    "PP2000",
    "FatalError"
  );
  state.realm.handleError(error);
  throw new FatalError();
}

function buildFromNumberValue(state: CompilerState, value: NumberValue, builder: IRBuilder): LLVMValue {
  if (value instanceof IntegralValue) {
    return ConstantInt.get(llvmContext, value.value);
  } else {
    return ConstantFP.get(llvmContext, value.value);
  }
}

function buildFromStringValue(state: CompilerState, value: StringValue, builder: IRBuilder): LLVMValue {
  let error = new CompilerDiagnostic(
    "String types are not yet supported in the LLVM backend.",
    value.expressionLocation,
    "PP2000",
    "FatalError"
  );
  state.realm.handleError(error);
  throw new FatalError();
}

function buildFromSymbolValue(state: CompilerState, value: SymbolValue, builder: IRBuilder): LLVMValue {
  let error = new CompilerDiagnostic(
    "Symbols are not yet supported in the LLVM backend.",
    value.expressionLocation,
    "PP2000",
    "FatalError"
  );
  state.realm.handleError(error);
  throw new FatalError();
}

function buildNewValue(state: CompilerState, value: Value, builder: IRBuilder): LLVMValue {
  if (value.isIntrinsic()) {
    return buildFromIntrinsicValue(state, value, builder);
  } else if (value instanceof AbstractValue) {
    return buildFromAbstractValue(state, value, builder);
  } else if (value instanceof EmptyValue) {
    invariant(false, "Since we never serialize objects we should never need the empty value.");
  } else if (value instanceof UndefinedValue) {
    let error = new CompilerDiagnostic(
      "This undefined value cannot be used in this operation.",
      value.expressionLocation,
      "PP2000",
      "FatalError"
    );
    state.realm.handleError(error);
    throw new FatalError();
  } else if (value instanceof SymbolValue) {
    return buildFromSymbolValue(state, value, builder);
  } else if (value instanceof StringValue) {
    return buildFromStringValue(state, value, builder);
  } else if (value instanceof NumberValue) {
    return buildFromNumberValue(state, value, builder);
  } else if (value instanceof BooleanValue) {
    return value.value ? ConstantInt.getTrue(llvmContext) : ConstantInt.getFalse(llvmContext);
  } else if (value instanceof NullValue) {
    // Null values need a specific type and should be enforced at the call site.
    let error = new CompilerDiagnostic(
      "This null value cannot be used in this operation.",
      value.expressionLocation,
      "PP2000",
      "FatalError"
    );
    state.realm.handleError(error);
    throw new FatalError();
  } else if (value instanceof FunctionValue) {
    // TODO: Serialize optimized functions and pass as function pointer.
    // If this function closes over abstract values, pass as closure,
    // this needs memory management.
    let error = new CompilerDiagnostic(
      "Functions cannot yet leak to the host environment in the LLVM backend.",
      value.expressionLocation,
      "PP2000",
      "FatalError"
    );
    state.realm.handleError(error);
    throw new FatalError();
  } else if (value instanceof ObjectValue) {
    let error = new CompilerDiagnostic(
      "This object value cannot be used in this operation.",
      value.expressionLocation,
      "PP2000",
      "FatalError"
    );
    state.realm.handleError(error);
    throw new FatalError();
  } else {
    invariant(false, "Unknown value type: " + value.constructor.name);
  }
}

export function buildFromValue(state: CompilerState, value: Value, builder: IRBuilder): LLVMValue {
  let llvmValue = state.builtValues.get(value);
  if (llvmValue) {
    return llvmValue;
  }
  llvmValue = buildNewValue(state, value, builder);
  state.builtValues.set(value, llvmValue);
  return llvmValue;
}
