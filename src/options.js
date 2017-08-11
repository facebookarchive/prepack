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
  additionalFunctions?: Array<string>,
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

export type PartialEvaluatorOptions = {
  sourceMaps?: boolean,
};

export const defaultOptions = {};
