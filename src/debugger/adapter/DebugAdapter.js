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
import child_process from "child_process";
import Queue from "queue-fifo";

/* An implementation of an debugger adapter adhering to the VSCode Debug protocol
 * The adapter is responsible for communication between the UI and Prepack
*/
class PrepackDebugSession extends LoggingDebugSession {
  /**
   * Creates a new debug adapter that is used for one debug session.
   * We configure the default implementation of a debug adapter here.
   */
  constructor() {
    super("prepack");
    this.setDebuggerLinesStartAt1(true);
    this.setDebuggerColumnsStartAt1(true);
    this._readCLIParameters();
    this._startPrepack();
  }

  _prepackCommand: string;
  _prepackProcess: child_process.ChildProcess;
  _messageQueue: Queue;

  _readCLIParameters() {
    let args = Array.from(process.argv);
    args.splice(0, 2);
    while (args.length > 0) {
      let arg = args.shift();
      if (arg.startsWith("--")) {
        arg = arg.slice(2);
        if (arg === "prepack") {
          this._prepackCommand = args.shift();
        }
      } else {
        console.error("Unknown parameter: " + arg);
        process.exit(1);
      }
    }
  }

  // Start Prepack in a child process
  _startPrepack() {
    if (this._prepackCommand.length === 0) {
      console.error("No command given to start Prepack in adapter");
      process.exit(1);
    }
    //set up message queue
    this._queue = new Queue();

    this._prepackProcess = child_process.spawn("node", [this._prepackCommand]);

    process.on("exit", () => {
      if (this._prepackProcess) this._prepackProcess.kill();
      process.exit();
    });

    process.on("SIGINT", () => {
      if (this._prepackProcess) this._prepackProcess.kill();
      process.exit();
    });
  }

  /**
   * The 'initialize' request is the first request called by the UI
   * to interrogate the features the debug adapter provides.
   */
  initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
    // Let the UI know that we can start accepting breakpoint requests.
    // The UI will end the configuration sequence by calling 'configurationDone' request.
    this.sendEvent(new InitializedEvent());

    response.body = response.body || {};
    response.body.supportsConfigurationDoneRequest = true;
    //Respond back to the UI with the configurations. Will add more configurations gradually as needed.
    this.sendResponse(response);
  }
}

DebugSession.run(PrepackDebugSession);
