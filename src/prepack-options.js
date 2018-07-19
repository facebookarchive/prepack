/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import type { ErrorHandler } from "./errors.js";
import type { SerializerOptions, RealmOptions, Compatibility, ReactOutputTypes, InvariantModeTypes } from "./options";
import { Realm } from "./realm.js";
import type { DebuggerConfigArguments } from "./types";
import type { BabelNodeFile } from "@babel/types";

export type PrepackOptions = {|
  additionalGlobals?: Realm => void,
  lazyObjectsRuntime?: string,
  heapGraphFormat?: "DotLanguage" | "VISJS",
  compatibility?: Compatibility,
  debugNames?: boolean,
  delayInitializations?: boolean,
  delayUnsupportedRequires?: boolean,
  accelerateUnsupportedRequires?: boolean,
  inputSourceMapFilename?: string,
  internalDebug?: boolean,
  debugScopes?: boolean,
  debugIdentifiers?: Array<string>,
  logStatistics?: boolean,
  logModules?: boolean,
  mathRandomSeed?: string,
  errorHandler?: ErrorHandler,
  invariantLevel?: number,
  invariantMode?: InvariantModeTypes,
  emitConcreteModel?: boolean,
  outputFilename?: string,
  profile?: boolean,
  instantRender?: boolean,
  reactEnabled?: boolean,
  reactOutput?: ReactOutputTypes,
  reactVerbose?: boolean,
  reactOptimizeNestedFunctions?: boolean,
  residual?: boolean,
  serialize?: boolean,
  check?: Array<number>,
  inlineExpressions?: boolean,
  sourceMaps?: boolean,
  initializeMoreModules?: boolean,
  statsFile?: string,
  strictlyMonotonicDateNow?: boolean,
  stripFlow?: boolean,
  timeout?: number,
  trace?: boolean,
  uniqueSuffix?: string,
  maxStackDepth?: number,
  debugInFilePath?: string,
  debugOutFilePath?: string,
  abstractValueImpliesMax?: number,
  debuggerConfigArgs?: DebuggerConfigArguments,
  onParse?: BabelNodeFile => void,
|};

export function getRealmOptions({
  compatibility = "browser",
  debugNames = false,
  errorHandler,
  mathRandomSeed,
  invariantLevel = 0,
  invariantMode = "throw",
  emitConcreteModel = false,
  uniqueSuffix,
  instantRender,
  reactEnabled,
  reactOutput,
  reactVerbose,
  reactOptimizeNestedFunctions,
  residual,
  serialize = !residual,
  check,
  strictlyMonotonicDateNow,
  stripFlow,
  timeout,
  maxStackDepth,
  abstractValueImpliesMax,
  debuggerConfigArgs,
}: PrepackOptions): RealmOptions {
  return {
    compatibility,
    debugNames,
    errorHandler,
    mathRandomSeed,
    invariantLevel,
    invariantMode,
    emitConcreteModel,
    uniqueSuffix,
    instantRender,
    reactEnabled,
    reactOutput,
    reactVerbose,
    reactOptimizeNestedFunctions,
    residual,
    serialize,
    check,
    strictlyMonotonicDateNow,
    stripFlow,
    timeout,
    maxStackDepth,
    abstractValueImpliesMax,
    debuggerConfigArgs,
  };
}

export function getSerializerOptions({
  lazyObjectsRuntime,
  heapGraphFormat,
  delayInitializations = false,
  delayUnsupportedRequires = false,
  accelerateUnsupportedRequires = true,
  internalDebug = false,
  debugScopes = false,
  debugIdentifiers,
  logStatistics = false,
  logModules = false,
  profile = false,
  inlineExpressions = false,
  initializeMoreModules = false,
  trace = false,
}: PrepackOptions): SerializerOptions {
  let result: SerializerOptions = {
    delayInitializations,
    delayUnsupportedRequires,
    accelerateUnsupportedRequires,
    initializeMoreModules,
    internalDebug,
    debugScopes,
    debugIdentifiers,
    logStatistics,
    logModules,
    profile,
    inlineExpressions,
    trace,
  };
  if (lazyObjectsRuntime !== undefined) {
    result.lazyObjectsRuntime = lazyObjectsRuntime;
  }
  if (heapGraphFormat !== undefined) {
    result.heapGraphFormat = heapGraphFormat;
  }
  return result;
}
