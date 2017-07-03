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
import type { RealmOptions, Compatibility } from "./types";
import type { SerializerOptions } from "./serializer/types";

export type Options = {|
  onError?: ErrorHandler,
  filename?: string,
  inputSourceMapFilename?: string,
  sourceMaps?: boolean,
  compatibility?: Compatibility,
  mathRandomSeed?: string,
  speculate?: boolean,
  trace?: boolean,
  debugNames?: boolean,
  singlePass?: boolean,
  logStatistics?: boolean,
  logModules?: boolean,
  delayUnsupportedRequires?: boolean,
  internalDebug?: boolean,
  uniqueSuffix?: string,
  timeout?: number,
  residual?: boolean,
  serialize?: boolean,
  strictlyMonotonicDateNow?: boolean,
  profile?: boolean,
|};

export const defaultOptions = {};

export function getRealmOptions({
  compatibility = "browser",
  onError,
  mathRandomSeed,
  debugNames = false,
  uniqueSuffix,
  timeout,
  residual,
  serialize = !residual,
  strictlyMonotonicDateNow,
}: Options): RealmOptions {
  return {
    compatibility,
    errorHandler: onError,
    mathRandomSeed,
    debugNames,
    uniqueSuffix,
    timeout,
    residual,
    serialize,
    strictlyMonotonicDateNow,
  };
}

export function getSerializerOptions({
  speculate = false,
  trace = false,
  singlePass = false,
  logStatistics = false,
  logModules = false,
  delayUnsupportedRequires = false,
  internalDebug = false,
  profile = false
}: Options): SerializerOptions {
  return {
    initializeMoreModules: speculate,
    trace,
    singlePass,
    logStatistics,
    logModules,
    delayUnsupportedRequires,
    internalDebug,
    profile
  };
}
