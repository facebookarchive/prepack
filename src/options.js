/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import type { ErrorHandler } from "./errors.js";

export type Compatibility = "browser" | "jsc-600-1-4-17" | "mobile" | "node-source-maps" | "fb-www" | "node-react";
export const CompatibilityValues = ["browser", "jsc-600-1-4-17", "mobile", "node-source-maps", "fb-www", "node-react"];

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
export const DiagnosticSeverityValues = ["FatalError", "RecoverableError", "Warning", "Information"];

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
  serialize?: boolean,
  strictlyMonotonicDateNow?: boolean,
  timeout?: number,
  maxStackDepth?: number,
  instantRender?: boolean,
  reactEnabled?: boolean,
  reactOutput?: ReactOutputTypes,
  reactVerbose?: boolean,
  reactOptimizeNestedFunctions?: boolean,
  stripFlow?: boolean,
  abstractValueImpliesMax?: number,
  arrayNestedOptimizedFunctionsEnabled?: boolean,
  reactFailOnUnsupportedSideEffects?: boolean,
  removeModuleFactoryFunctions?: boolean,
};

export type SerializerOptions = {
  lazyObjectsRuntime?: string,
  delayInitializations?: boolean,
  modulesToInitialize?: Set<string | number> | "ALL",
  internalDebug?: boolean,
  debugScopes?: boolean,
  debugIdentifiers?: Array<string>,
  logStatistics?: boolean,
  logModules?: boolean,
  profile?: boolean,
  inlineExpressions?: boolean,
  trace?: boolean,
  heapGraphFormat?: "DotLanguage" | "VISJS",
};

export const defaultOptions = {};
