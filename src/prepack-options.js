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
import type { SerializerOptions, RealmOptions, Compatibility, DebuggerOptions } from "./options";
import { Realm } from "./realm.js";

export type PrepackOptions = {|
  additionalGlobals?: Realm => void,
  additionalFunctions?: Array<string>,
  compatibility?: Compatibility,
  debugNames?: boolean,
  delayInitializations?: boolean,
  delayUnsupportedRequires?: boolean,
  inputSourceMapFilename?: string,
  internalDebug?: boolean,
  logStatistics?: boolean,
  logModules?: boolean,
  mathRandomSeed?: string,
  errorHandler?: ErrorHandler,
  omitInvariants?: boolean,
  outputFilename?: string,
  profile?: boolean,
  reactEnabled?: boolean,
  residual?: boolean,
  serialize?: boolean,
  inlineExpressions?: boolean,
  sourceMaps?: boolean,
  initializeMoreModules?: boolean,
  statsFile?: string,
  strictlyMonotonicDateNow?: boolean,
  timeout?: number,
  trace?: boolean,
  uniqueSuffix?: string,
  maxStackDepth?: number,
  enableDebugger?: boolean,
  debugInFilePath?: string,
  debugOutFilePath?: string,
|};

export function getRealmOptions({
  compatibility = "browser",
  debugNames = false,
  errorHandler,
  mathRandomSeed,
  omitInvariants = false,
  uniqueSuffix,
  reactEnabled,
  residual,
  serialize = !residual,
  strictlyMonotonicDateNow,
  timeout,
  maxStackDepth,
}: PrepackOptions): RealmOptions {
  return {
    compatibility,
    debugNames,
    errorHandler,
    mathRandomSeed,
    omitInvariants,
    uniqueSuffix,
    reactEnabled,
    residual,
    serialize,
    strictlyMonotonicDateNow,
    timeout,
    maxStackDepth,
  };
}

export function getSerializerOptions({
  additionalFunctions,
  delayInitializations = false,
  delayUnsupportedRequires = false,
  internalDebug = false,
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
    initializeMoreModules,
    internalDebug,
    logStatistics,
    logModules,
    profile,
    inlineExpressions,
    trace,
  };
  if (additionalFunctions) result.additionalFunctions = additionalFunctions;
  return result;
}

export function getDebuggerOptions({
  debugInFilePath = "./src/debugger/.sessionlogs/adapter2engine.txt",
  debugOutFilePath = "./src/debugger/.sessionlogs/engine2adapter.txt",
}: PrepackOptions): DebuggerOptions {
  let result: DebuggerOptions = {
    inFilePath: debugInFilePath,
    outFilePath: debugOutFilePath,
  };
  return result;
}
