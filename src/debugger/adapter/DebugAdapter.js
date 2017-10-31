/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import {
  DebugSession,
  LoggingDebugSession,
  InitializedEvent,
  OutputEvent,
  TerminatedEvent,
  StoppedEvent,
} from "vscode-debugadapter";
import EventEmitter from "events";
import * as DebugProtocol from "vscode-debugprotocol";
import child_process from "child_process";
import { AdapterChannel } from "./../channel/AdapterChannel.js";
import type { DebuggerOptions } from "./../../options.js";
import { getDebuggerOptions } from "./../../prepack-options.js";
import invariant from "./../../invariant.js";
import { DebugMessage } from "./../channel/DebugMessage.js";
import type { BreakpointRequestArguments } from "./../types.js";

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
    this._eventEmitter = new EventEmitter();
    this._pendingRequestCallbacks = new Map();
    this._readCLIParameters();
    this._startPrepack();
  }

  _prepackCommand: string;
  _inFilePath: string;
  _outFilePath: string;
  _prepackProcess: child_process.ChildProcess;
  _adapterChannel: AdapterChannel;
  _debuggerOptions: DebuggerOptions;
  _prepackWaiting: boolean;
  _eventEmitter: EventEmitter;
  _pendingRequestCallbacks: { [number]: (string) => void };

  _readCLIParameters() {
    let args = Array.from(process.argv);
    args.splice(0, 2);
    let inFilePath;
    let outFilePath;
    while (args.length > 0) {
      let arg = args.shift();
      if (arg.startsWith("--")) {
        arg = arg.slice(2);
        if (arg === "prepack") {
          this._prepackCommand = args.shift();
        } else if (arg === "inFilePath") {
          inFilePath = args.shift();
        } else if (arg === "outFilePath") {
          outFilePath = args.shift();
        }
      } else {
        console.error("Unknown parameter: " + arg);
        process.exit(1);
      }
    }
    if (!inFilePath || inFilePath.length === 0) {
      console.error("No debugger input file given");
      process.exit(1);
    }
    if (!outFilePath || outFilePath.length === 0) {
      console.error("No debugger output file given");
      process.exit(1);
    }
    this._debuggerOptions = getDebuggerOptions({
      debugInFilePath: inFilePath,
      debugOutFilePath: outFilePath,
    });
  }

  // Start Prepack in a child process
  _startPrepack() {
    if (!this._prepackCommand || this._prepackCommand.length === 0) {
      console.error("No command given to start Prepack in adapter");
      process.exit(1);
    }

    this._registerMessageCallbacks();
    // set up the communication channel
    this._adapterChannel = new AdapterChannel(this._debuggerOptions, this._eventEmitter);

    let prepackArgs = this._prepackCommand.split(" ");
    // Note: here the input file for the adapter is the output file for Prepack, and vice versa.
    prepackArgs = prepackArgs.concat([
      "--debugInFilePath",
      this._debuggerOptions.outFilePath,
      "--debugOutFilePath",
      this._debuggerOptions.inFilePath,
    ]);
    this._prepackProcess = child_process.spawn("node", prepackArgs);

    process.on("exit", () => {
      this._prepackProcess.kill();
      this._adapterChannel.clean();
      process.exit();
    });

    process.on("SIGINT", () => {
      this._prepackProcess.kill();
      process.exit();
    });

    this._prepackProcess.stdout.on("data", (data: Buffer) => {
      let outputEvent = new OutputEvent(data.toString(), "stdout");
      this.sendEvent(outputEvent);
    });

    this._prepackProcess.on("exit", () => {
      this.sendEvent(new TerminatedEvent());
      process.exit();
    });
  }

  _registerMessageCallbacks() {
    this._eventEmitter.addListener(DebugMessage.PREPACK_READY_RESPONSE, () => {
      this.sendEvent(new StoppedEvent("entry", 1));
    });
    this._eventEmitter.addListener(DebugMessage.BREAKPOINT_STOPPED_RESPONSE, (description: string) => {
      this.sendEvent(new StoppedEvent("breakpoint " + description, 1));
    });
  }

  _addRequestCallback(requestID: number, callback: string => void) {
    invariant(!(requestID in this._pendingRequestCallbacks), "Request ID already exists in pending requests");
    this._pendingRequestCallbacks[requestID] = callback;
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
    // Respond back to the UI with the configurations. Will add more configurations gradually as needed.
    // Adapter can respond immediately here because no message is sent to Prepack
    this.sendResponse(response);
  }

  /**
   * Request Prepack to continue running when it is stopped
  */
  continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
    // queue a Run request to Prepack and try to send the next request in the queue
    this._adapterChannel.queueContinueRequest(response.request_seq, (message: string) => {
      this.sendResponse(response);
    });
  }

  setBreakPointsRequest(
    response: DebugProtocol.SetBreakpointsResponse,
    args: DebugProtocol.SetBreakpointsArguments
  ): void {
    if (!args.source.path || !args.breakpoints) return;
    let filePath = args.source.path;
    let breakpointInfos = [];
    for (const breakpoint of args.breakpoints) {
      let line = breakpoint.line;
      let column = 0;
      if (breakpoint.column) {
        column = breakpoint.column;
      }
      let breakpointInfo: BreakpointRequestArguments = {
        kind: "breakpoint",
        requestID: response.request_seq,
        filePath: filePath,
        line: line,
        column: column,
      };
      breakpointInfos.push(breakpointInfo);
    }
    this._adapterChannel.queueSetBreakpointsRequest(response.request_seq, breakpointInfos, (message: string) => {
      this.sendResponse(response);
    });
  }
}

DebugSession.run(PrepackDebugSession);
