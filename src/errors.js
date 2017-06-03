/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

// This is the error format used to report errors to the caller-supplied
// error-handler
export class ProgramEvaluationError extends Error {
  constructor(message: string, stack: string) {
    super(message);
    this.stack = stack;
  }
}

export type ErrorHandler = (error: ProgramEvaluationError) => boolean;
