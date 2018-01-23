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
  additionalFunctions?: Array<string>,
  abstractEffectsInAdditionalFunctions?: boolean,
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
  logStatistics?: boolean,
  logModules?: boolean,
  mathRandomSeed?: string,
  errorHandler?: ErrorHandler,
  omitInvariants?: boolean,
  outputFilename?: string,
  profile?: boolean,
  reactEnabled?: boolean,
  reactOutput?: ReactOutputTypes,
  residual?: boolean,
  serialize?: boolean,
  check?: boolean,
  inlineExpressions?: boolean,
  simpleClosures?: boolean,
  sourceMaps?: boolean,
  initializeMoreModules?: boolean,
  statsFile?: string,
  strictlyMonotonicDateNow?: boolean,
  timeout?: number,
  trace?: boolean,
  uniqueSuffix?: string,
  maxStackDepth?: number,
  debugInFilePath?: string,
  debugOutFilePath?: string,
|};

export function getRealmOptions({
  abstractEffectsInAdditionalFunctions = false,
  compatibility = "browser",
  debugNames = false,
  errorHandler,
  mathRandomSeed,
  omitInvariants = false,
  uniqueSuffix,
  reactEnabled,
  reactOutput,
  residual,
  serialize = !residual,
  check,
  strictlyMonotonicDateNow,
  timeout,
  maxStackDepth,
}: PrepackOptions): RealmOptions {
  return {
    abstractEffectsInAdditionalFunctions,
    compatibility,
    debugNames,
    errorHandler,
    mathRandomSeed,
    omitInvariants,
    uniqueSuffix,
    reactEnabled,
    reactOutput,
    residual,
    serialize,
    check,
    strictlyMonotonicDateNow,
    timeout,
    maxStackDepth,
  };
}

export function getSerializerOptions({
  additionalFunctions,
  lazyObjectsRuntime,
  heapGraphFormat,
  delayInitializations = false,
  delayUnsupportedRequires = false,
  accelerateUnsupportedRequires = true,
  internalDebug = false,
  debugScopes = false,
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
    logStatistics,
    logModules,
    profile,
    inlineExpressions,
    simpleClosures,
    trace,
  };
  if (additionalFunctions) result.additionalFunctions = additionalFunctions;
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
