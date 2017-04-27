/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { RealmOptions } from "./types";
import type { SerializerOptions } from "./serializer/types";

export type Options = {
  filename?: string,
  inputSourceMapFilename?: string,
  sourceMaps?: boolean,
  compatibility?: "browser" | "jsc-600-1-4-17",
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
  strictlyMonotonicDateNow?: boolean,
};

export function getRealmOptions({
  compatibility = "browser",
  mathRandomSeed,
  debugNames = false,
  uniqueSuffix,
  timeout,
  strictlyMonotonicDateNow
}: Options): RealmOptions {
  return {
    partial: true,
    compatibility,
    mathRandomSeed,
    debugNames,
    uniqueSuffix,
    timeout,
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
  internalDebug = false
}: Options): SerializerOptions {
  return {
    initializeMoreModules: speculate,
    trace,
    singlePass,
    logStatistics,
    logModules,
    delayUnsupportedRequires,
    internalDebug,
  };
}
