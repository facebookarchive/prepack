/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import construct_realm from "./construct_realm.js";
import initializeGlobals from "./globals.js";
import { getRealmOptions } from "./prepack-options";
import type { SourceFile } from "./types.js";
import type { PrepackOptions } from "./prepack-options";
import { defaultOptions } from "./options";
import { type SerializedResult } from "./serializer/types.js";
import { SerializerStatistics } from "./serializer/statistics.js";
import type { DebuggerConfigArguments } from "./types";

export function prepackSourcesToLLVMModule(
  sources: Array<SourceFile>,
  options: PrepackOptions = defaultOptions,
  debuggerConfigArgs: void | DebuggerConfigArguments,
  statistics: SerializerStatistics | void = undefined
): SerializedResult {
  let realmOptions = getRealmOptions(options);
  realmOptions.errorHandler = options.errorHandler;
  let realm = construct_realm(realmOptions, debuggerConfigArgs, statistics || new SerializerStatistics());
  initializeGlobals(realm);
  if (typeof options.additionalGlobals === "function") {
    options.additionalGlobals(realm);
  }

  // This require is inlined to avoid taking on a hard dependency on this
  // package. No need to battle with the installation process of native
  // dependencies if the LLVM option isn't used.
  const llvm = require("llvm-node");

  let context = new llvm.LLVMContext();
  let llvmModule = new llvm.Module("", context);
  if (sources.length === 1 && sources[0].filePath) {
    llvmModule.sourceFileName = sources[0].filePath;
  }
  return {
    code: "", // Empty for LLVM modules
    map: undefined,
    statistics,
    llvmModule: llvmModule,
  };
}
