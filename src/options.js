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

export type Compatibility =
  | "browser"
  | "jsc-600-1-4-17"
  | "mobile"
  | "node-source-maps"
  | "node-cli"
  | "fb-www"
  | "node-react";
export const CompatibilityValues = [
  "browser",
  "jsc-600-1-4-17",
  "mobile",
  "node-source-maps",
  "node-cli",
  "fb-www",
  "node-react",
];

export type InvariantModeTypes = "throw" | "info" | "warn" | "error";
export const InvariantModeValues = ["throw", "info", "warn", "error"];
export type ReactOutputTypes = "create-element" | "jsx" | "bytecode";
export const ReactOutputValues = ["create-element", "jsx", "bytecode"];

export type RealmOptions = {
  check?: Array<number>,
  compatibility?: Compatibility,
  debugNames?: boolean,
  errorHandler?: ErrorHandler,
  mathRandomSeed?: string,
  invariantLevel?: number,
  invariantMode?: InvariantModeTypes,
  emitConcreteModel?: boolean,
  uniqueSuffix?: string,
  residual?: boolean,
  serialize?: boolean,
  strictlyMonotonicDateNow?: boolean,
  timeout?: number,
  maxStackDepth?: number,
  reactEnabled?: boolean,
  reactOutput?: ReactOutputTypes,
  reactVerbose?: boolean,
  stripFlow?: boolean,
  abstractValueImpliesMax?: number,
};

export type SerializerOptions = {
  lazyObjectsRuntime?: string,
  delayInitializations?: boolean,
  delayUnsupportedRequires?: boolean,
  accelerateUnsupportedRequires?: boolean,
  initializeMoreModules?: boolean,
  internalDebug?: boolean,
  debugScopes?: boolean,
  debugIdentifiers?: Array<string>,
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
