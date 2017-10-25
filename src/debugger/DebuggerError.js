/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

// More error types will be added over time
export type DebuggerErrorType = "Invalid command" | "Invalid response"

export class DebuggerError {
  constructor(errorType: DebuggerErrorType, message: string) {
    this._errorType = errorType;
    this._message = message;
  }
  _errorType: DebuggerErrorType;
  _message: string;
}
