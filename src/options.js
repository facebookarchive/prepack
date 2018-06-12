/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict */

import type { ErrorHandler } from "./errors.js";
import type { DebuggerConfigArguments } from "./debugger/common/types";

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

export type InvariantModeTypes =
  | "throw"
  | "console.info"
  | "console.warn"
  | "console.error"
  | "nativeLoggingHook+0"
  | "nativeLoggingHook+1"
  | "nativeLoggingHook+3"
  | "nativeLoggingHook+2";
export const InvariantModeValues = [
  "throw",
  "console.info",
  "console.warn",
  "console.error",
  "nativeLoggingHook+0",
  "nativeLoggingHook+1",
  "nativeLoggingHook+2",
  "nativeLoggingHook+3",
];

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
  reactOptimizeNestedFunctions?: boolean,
  stripFlow?: boolean,
  abstractValueImpliesMax?: number,
  debuggerConfigArgs?: DebuggerConfigArguments,
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
  trace?: boolean,
  heapGraphFormat?: "DotLanguage" | "VISJS",
  prepackInfo?: boolean,
};

export type PartialEvaluatorOptions = {
  sourceMaps?: boolean,
};

export type DebuggerOptions = {
  inFilePath: string,
  outFilePath: string,
};

export const defaultOptions = {};
