/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { DebugSession, LoggingDebugSession, InitializedEvent } from "vscode-debugadapter";
import * as DebugProtocol from "vscode-debugprotocol";

class PrepackDebugSession extends LoggingDebugSession {
  /**
   * Creates a new debug adapter that is used for one debug session.
   * We configure the default implementation of a debug adapter here.
   */
  constructor() {
    super("prepack");
    this.setDebuggerLinesStartAt1(true);
    this.setDebuggerColumnsStartAt1(true);
  }

  /**
   * The 'initialize' request is the first request called by the frontend
   * to interrogate the features the debug adapter provides.
   */
  initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
    // Let the frontend know that we can start accepting breakpoint requests.
    // The frontend will end the configuration sequence by calling 'configurationDone' request.
    this.sendEvent(new InitializedEvent());

    response.body = response.body || {};

    //Respond back to the frontend with the configurations. Will add the configurations gradually as needed.
    this.sendResponse(response);
  }
}

DebugSession.run(PrepackDebugSession);
