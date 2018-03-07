/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { BabelNodeSourceLocation } from "babel-types";

export type Severity = "FatalError" | "RecoverableError" | "Warning" | "Information";
export type ErrorHandlerResult = "Fail" | "Recover";
export type ErrorCode = "PP0001";

// This is the error format used to report errors to the caller-supplied
// error-handler
export class CompilerDiagnostic extends Error {
  constructor(message: string, location: ?BabelNodeSourceLocation, errorCode: string, severity: Severity) {
    super(message);

    this.location = location;
    this.severity = severity;
    this.errorCode = errorCode;
  }

  callStack: void | string;
  location: ?BabelNodeSourceLocation;
  severity: Severity;
  errorCode: string;
}

// This error is thrown to exit Prepack when an ErrorHandler returns 'FatalError'
// This should just be a class but Babel classes doesn't work with
// built-in super classes.
export class FatalError extends Error {
  constructor(message?: string) {
    super(message || "A fatal error occurred while prepacking.");
  }
}

export type ErrorHandler = (error: CompilerDiagnostic) => ErrorHandlerResult;
