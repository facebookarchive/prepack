/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { Generator } from "../../utils/generator.js";
import type { CompilerState } from "../CompilerState.js";
import type { AbstractValue, ObjectValue, SymbolValue, Value } from "../../values/index.js";
import type { Binding } from "../../environment.js";
import type { Descriptor, PropertyBinding } from "../../types.js";
import type {
  BabelNodeExpression,
  BabelNodeIdentifier,
  BabelNodeStatement,
  BabelNodeMemberExpression,
  BabelNodeLVal,
} from "@babel/types";

import { CompilerDiagnostic, FatalError } from "../../errors.js";
import { BasicBlock } from "llvm-node";
import { llvmContext } from "../llvm-context.js";

export function buildFromGenerator(state: CompilerState, generator: Generator): BasicBlock {
  let block = BasicBlock.create(llvmContext);

  let serializationContext = {
    serializeValue(value: Value): BabelNodeExpression {
      let error = new CompilerDiagnostic(
        "Unsupported value type in the LLVM backend.",
        value.expressionLocation,
        "PP2000",
        "FatalError"
      );
      state.realm.handleError(error);
      throw new FatalError();
    },
    serializeBinding(binding: Binding): BabelNodeIdentifier | BabelNodeMemberExpression {
      let error = new CompilerDiagnostic(
        "Residual bindings are unsupported in the LLVM backend.",
        undefined,
        "PP2000",
        "FatalError"
      );
      state.realm.handleError(error);
      throw new FatalError();
    },
    getPropertyAssignmentStatement(
      location: BabelNodeLVal,
      value: Value,
      mightHaveBeenDeleted: boolean,
      deleteIfMightHaveBeenDeleted: boolean
    ): BabelNodeStatement {
      let error = new CompilerDiagnostic(
        "Property assignments to intrinsics are unsupported in the LLVM backend.",
        location.loc,
        "PP2000",
        "FatalError"
      );
      state.realm.handleError(error);
      throw new FatalError();
    },
    serializeGenerator(gen: Generator, valuesToProcess: Set<AbstractValue | ObjectValue>): Array<BabelNodeStatement> {
      throw new Error("TODO");
    },
    initGenerator(gen: Generator): void {},
    finalizeGenerator(gen: Generator): void {},
    emitDefinePropertyBody(val: ObjectValue, key: string | SymbolValue, desc: Descriptor): BabelNodeStatement {
      let error = new CompilerDiagnostic(
        "Property assignments to intrinsics are unsupported in the LLVM backend.",
        val.expressionLocation,
        "PP2000",
        "FatalError"
      );
      state.realm.handleError(error);
      throw new FatalError();
    },
    emit(statement: BabelNodeStatement): void {
      let error = new CompilerDiagnostic(
        "Unsupported statement type in the LLVM backend.",
        statement.loc,
        "PP2000",
        "FatalError"
      );
      state.realm.handleError(error);
      throw new FatalError();
    },
    processValues(valuesToProcess: Set<AbstractValue | ObjectValue>): void {},
    canOmit(val: Value): boolean {
      return false;
    },
    declare(value: AbstractValue | ObjectValue): void {},
    emitPropertyModification(binding: PropertyBinding): void {
      throw new FatalError();
    },
    emitBindingModification(binding: Binding): void {
      throw new FatalError();
    },
    debugScopes: false,
  };

  generator.serialize(serializationContext);

  return block;
}
