/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict */

export class DebuggerConstants {
  // request ID used between the debug adapter and Prepack when there is no
  // corresponding command from the UI. Currently, this is only used on starting
  // up Prepack
  static DEFAULT_REQUEST_ID: number = 0;

  // some requests/responses require a thread ID according to vscode protocol
  // since Prepack only has 1 thread, we use this constant where a thread ID
  // is required
  static PREPACK_THREAD_ID: number = 1;

  // clientID used in initialize requests by the CLI
  static CLI_CLIENTID: string = "Prepack-Debugger-CLI";
}
