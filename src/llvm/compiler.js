/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { Realm, ExecutionContext } from "../realm.js";
import { IntegralValue } from "../values/index.js";
import { CompilerDiagnostic, FatalError } from "../errors.js";
import type { SourceFile } from "../types.js";
import { AbruptCompletion } from "../completions.js";
import { Generator } from "../utils/generator.js";
import invariant from "../invariant.js";
import { Logger } from "../utils/logger.js";
import { Module, Function as LLVMFunction, FunctionType, Type, LinkageTypes } from "llvm-node";
import { llvmContext } from "./llvm-context.js";
import { CompilerState } from "./CompilerState";
import { buildFromGenerator } from "./builders/index.js";

export function compileSources(
  realm: Realm,
  sources: Array<SourceFile>,
  sourceMaps?: boolean = false,
  internalDebug?: boolean = false
): Module {
  invariant(realm.useAbstractInterpretation);
  // Start tracking mutations
  let generator = new Generator(realm, "main", realm.pathConditions);
  realm.generator = generator;

  let logger = new Logger(realm, !!internalDebug);

  let [res] = realm.$GlobalEnv.executeSources(sources, "script");

  if (res instanceof AbruptCompletion) {
    let context = new ExecutionContext();
    realm.pushContext(context);
    try {
      logger.logCompletion(res);
    } finally {
      realm.popContext(context);
    }
    let diagnostic = new CompilerDiagnostic("Global code may end abruptly", res.location, "PP0016", "FatalError");
    realm.handleError(diagnostic);
    throw new FatalError();
  }

  // The return value is currently always 0 since we don't handle abrupt completion atm.
  let returnValue = IntegralValue.createFromNumberValue(realm, 0);
  generator.emitReturnValue(returnValue);

  let llvmModule = new Module("", llvmContext);

  let state = new CompilerState(realm, llvmModule, logger);

  // Create a main function for the main generator
  let mainFnType = FunctionType.get(Type.getInt32Ty(llvmContext), false);
  let mainFn = LLVMFunction.create(mainFnType, LinkageTypes.ExternalLinkage, "main", llvmModule);

  let mainBlock = buildFromGenerator(state, generator);

  mainFn.addBasicBlock(mainBlock);

  return llvmModule;
}
