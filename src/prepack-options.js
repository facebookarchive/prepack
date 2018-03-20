/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { ErrorHandler } from "./errors.js";
import type { SerializerOptions, RealmOptions, Compatibility, DebuggerOptions, ReactOutputTypes } from "./options";
import { Realm } from "./realm.js";
import invariant from "./invariant.js";

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
  omitInvariants?: boolean,
  emitConcreteModel?: boolean,
  outputFilename?: string,
  profile?: boolean,
  reactEnabled?: boolean,
  reactOutput?: ReactOutputTypes,
  reactVerbose?: boolean,
  residual?: boolean,
  serialize?: boolean,
  check?: Array<number>,
  inlineExpressions?: boolean,
  simpleClosures?: boolean,
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
|};

export function getRealmOptions({
  compatibility = "browser",
  debugNames = false,
  errorHandler,
  mathRandomSeed,
  omitInvariants = false,
  emitConcreteModel = false,
  uniqueSuffix,
  reactEnabled,
  reactOutput,
  reactVerbose,
  residual,
  serialize = !residual,
  check,
  strictlyMonotonicDateNow,
  stripFlow,
  timeout,
  maxStackDepth,
  abstractValueImpliesMax,
}: PrepackOptions): RealmOptions {
  return {
    compatibility,
    debugNames,
    errorHandler,
    mathRandomSeed,
    omitInvariants,
    emitConcreteModel,
    uniqueSuffix,
    reactEnabled,
    reactOutput,
    reactVerbose,
    residual,
    serialize,
    check,
    strictlyMonotonicDateNow,
    stripFlow,
    timeout,
    maxStackDepth,
    abstractValueImpliesMax,
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
  simpleClosures = false,
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
    simpleClosures,
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

export function getDebuggerOptions({ debugInFilePath, debugOutFilePath }: PrepackOptions): DebuggerOptions {
  invariant(debugInFilePath !== undefined, "Debugger invoked without input file path");
  invariant(debugOutFilePath !== undefined, "Debugger invoked without output file path");
  let result: DebuggerOptions = {
    inFilePath: debugInFilePath,
    outFilePath: debugOutFilePath,
  };
  return result;
}
