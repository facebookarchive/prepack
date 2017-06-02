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
export class NativeError extends Error {
  constructor(message: string, stack: string) {
    super(message);
    this.stack = stack;
  }
}

// This error is used to indicate a failure due to previously encountered
// errors that were deferred by the error-handler. The original errors
// have already been reported to the error-handler so their details are not
// included in this error (it's the responsibility of the error-handler to
// track them if needed)
export class DeferredErrorsError {
  constructor(message: string) {
    this.message = message;
  }

  message: string;
}

export type ErrorHandler = (error: NativeError) => boolean;
