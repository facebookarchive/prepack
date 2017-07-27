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

export type Compatibility = "browser" | "jsc-600-1-4-17" | "node-source-maps" | "node-cli";
export const CompatibilityValues = ["browser", "jsc-600-1-4-17", "node-source-maps", "node-cli"];

export type RealmOptions = {
  compatibility?: Compatibility,
  debugNames?: boolean,
  errorHandler?: ErrorHandler,
  mathRandomSeed?: string,
  uniqueSuffix?: string,
  residual?: boolean,
  serialize?: boolean,
  strictlyMonotonicDateNow?: boolean,
  timeout?: number,
};

export type SerializerOptions = {
  delayInitializations?: boolean,
  delayUnsupportedRequires?: boolean,
  initializeMoreModules?: boolean,
  internalDebug?: boolean,
  logStatistics?: boolean,
  logModules?: boolean,
  profile?: boolean,
  singlePass?: boolean,
  trace?: boolean,
};

export type Options = {|
  compatibility?: Compatibility,
  debugNames?: boolean,
  delayInitializations?: boolean,
  delayUnsupportedRequires?: boolean,
  inputSourceMapFilename?: string,
  internalDebug?: boolean,
  logStatistics?: boolean,
  logModules?: boolean,
  mathRandomSeed?: string,
  onError?: ErrorHandler,
  outputFilename?: string,
  profile?: boolean,
  residual?: boolean,
  serialize?: boolean,
  singlePass?: boolean,
  sourceMaps?: boolean,
  speculate?: boolean,
  statsFile?: string,
  strictlyMonotonicDateNow?: boolean,
  timeout?: number,
  trace?: boolean,
  uniqueSuffix?: string,
|};

export const defaultOptions = {};

export function getRealmOptions({
  compatibility = "browser",
  debugNames = false,
  onError,
  mathRandomSeed,
  uniqueSuffix,
  residual,
  serialize = !residual,
  strictlyMonotonicDateNow,
  timeout,
}: Options): RealmOptions {
  return {
    compatibility,
    debugNames,
    errorHandler: onError,
    mathRandomSeed,
    uniqueSuffix,
    residual,
    serialize,
    strictlyMonotonicDateNow,
    timeout,
  };
}

export function getSerializerOptions({
  delayInitializations = false,
  delayUnsupportedRequires = false,
  internalDebug = false,
  logStatistics = false,
  logModules = false,
  profile = false,
  singlePass = false,
  speculate = false,
  trace = false,
}: Options): SerializerOptions {
  return {
    delayInitializations,
    delayUnsupportedRequires,
    initializeMoreModules: speculate,
    internalDebug,
    logStatistics,
    logModules,
    profile,
    singlePass,
    trace,
  };
}
