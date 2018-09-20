/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict */

import type { BabelNodeSourceLocation } from "@babel/types";

// Information: Just an informative message with no semantic implications whatsoever.
// Warning: Prepack will produce code that matches the behavior of the original code, but the original code might have an error.
// RecoverableError: Prepack might produce code that deviates in behavior from the original code, if the original code is not well behaved.
// FatalError: Prepack is unable to produce code that could possibly match the behavior of the original code.
export type Severity = "FatalError" | "RecoverableError" | "Warning" | "Information";
export type ErrorHandlerResult = "Fail" | "Recover";
export type ErrorCode = "PP0001";

// This is the error format used to report errors to the caller-supplied
// error-handler
export class CompilerDiagnostic extends Error {
  constructor(
    message: string,
    location: ?BabelNodeSourceLocation,
    errorCode: string,
    severity: Severity,
    sourceFilePaths?: { sourceMaps: Array<string>, sourceFiles: Array<{ absolute: string, relative: string }> }
  ) {
    super(message);

    this.location = location;
    this.severity = severity;
    this.errorCode = errorCode;
    this.sourceFilePaths = sourceFilePaths;
  }

  callStack: void | string;
  location: ?BabelNodeSourceLocation;
  severity: Severity;
  errorCode: string;
  // For repro bundles, we need to pass the names of all sourcefiles/sourcemaps touched by Prepack back to the CLI.
  sourceFilePaths: void | { sourceMaps: Array<string>, sourceFiles: Array<{ absolute: string, relative: string }> };
}

// This error is thrown to exit Prepack when an ErrorHandler returns 'FatalError'
// This should just be a class but Babel classes doesn't work with
// built-in super classes.
export class FatalError extends Error {
  constructor(message?: string) {
    super(message === undefined ? "A fatal error occurred while prepacking." : message);
  }
}

// This error is thrown when exploring a path whose entry conditon implies that an earlier path conditon must be false.
// Such paths are infeasible (dead) and must be elided from the evaluation.
export class InfeasiblePathError extends Error {
  constructor() {
    super("Infeasible path explored");
  }
}

// This error is thrown when a false invariant is encountered. This error should never be swallowed.
export class InvariantError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export type ErrorHandler = (error: CompilerDiagnostic, suppressDiagnostics: boolean) => ErrorHandlerResult;

// When a side-effect occurs when evaluating a pure nested optimized function, we stop execution of that function
// and catch the error to properly handle the according logic (either bail-out or report the error).
// Ideally this should extend FatalError, but that will mean re-working every call-site that catches FatalError
// and make it treat NestedOptimizedFunctionSideEffect errors differently, which isn't ideal so maybe a better
// FatalError catching/handling process is needed throughout the codebase at some point.
export class NestedOptimizedFunctionSideEffect extends Error {}
