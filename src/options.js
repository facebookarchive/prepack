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

export type Compatibility = "browser" | "jsc-600-1-4-17" | "mobile" | "node-source-maps" | "node-cli" | "fb-www";
export const CompatibilityValues = ["browser", "jsc-600-1-4-17", "mobile", "node-source-maps", "node-cli", "fb-www"];
export type ReactOutputTypes = "create-element" | "jsx" | "bytecode";

export type RealmOptions = {
  check?: boolean,
  compatibility?: Compatibility,
  debugNames?: boolean,
  errorHandler?: ErrorHandler,
  mathRandomSeed?: string,
  omitInvariants?: boolean,
  uniqueSuffix?: string,
  residual?: boolean,
  serialize?: boolean,
  strictlyMonotonicDateNow?: boolean,
  timeout?: number,
  maxStackDepth?: number,
  reactEnabled?: boolean,
  reactOutput?: ReactOutputTypes,
  abstractEffectsInAdditionalFunctions?: boolean,
};

export type SerializerOptions = {
  additionalFunctions?: Array<string>,
  lazyObjectsRuntime?: string,
  delayInitializations?: boolean,
  delayUnsupportedRequires?: boolean,
  accelerateUnsupportedRequires?: boolean,
  initializeMoreModules?: boolean,
  internalDebug?: boolean,
  debugScopes?: boolean,
  logStatistics?: boolean,
  logModules?: boolean,
  profile?: boolean,
  inlineExpressions?: boolean,
  simpleClosures?: boolean,
  trace?: boolean,
  heapGraphFormat?: "DotLanguage" | "VISJS",
};

export type PartialEvaluatorOptions = {
  sourceMaps?: boolean,
};

export type DebuggerOptions = {
  inFilePath: string,
  outFilePath: string,
};

export const defaultOptions = {};
