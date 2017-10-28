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
import * as DebugProtocol from "vscode-debugprotocol";
import child_process from "child_process";
import Queue from "queue-fifo";
import { AdapterChannel } from "./../channel/AdapterChannel.js";
import type { DebuggerOptions } from "./../../options.js";
import { getDebuggerOptions } from "./../../prepack-options.js";
import invariant from "./../../invariant.js";
import { DebugMessage } from "./../channel/DebugMessage.js";
import { DebuggerConstants } from "./../DebuggerConstants.js";

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

    this._prepackWaiting = false;
    this._pendingRequestCallbacks = new Map();
    this._readCLIParameters();
    this._startPrepack();
  }

  _prepackCommand: string;
  _inFilePath: string;
  _outFilePath: string;
  _prepackProcess: child_process.ChildProcess;
  _messageQueue: Queue;
  _adapterChannel: AdapterChannel;
  _debuggerOptions: DebuggerOptions;
  _prepackWaiting: boolean;
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
    // set up message queue
    this._messageQueue = new Queue();
    // set up the communication channel
    this._adapterChannel = new AdapterChannel(this._debuggerOptions);
    this._adapterChannel.writeOut(`${DebuggerConstants.DEFAULT_REQUEST_ID} ${DebugMessage.DEBUGGER_ATTACHED}`);
    this._adapterChannel.listenOnFile(this._handleFileReadError.bind(this), this._processPrepackMessage.bind(this));

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

  _processPrepackMessage(message: string) {
    let parts = message.split(" ");
    let requestID = parseInt(parts[0], 10);
    invariant(!isNaN(requestID));
    let prefix = parts[1];
    if (prefix === DebugMessage.PREPACK_READY_RESPONSE) {
      this._prepackWaiting = true;
      // the second argument is the threadID required by the protocol, since
      // Prepack only has one thread, this argument will be ignored
      this.sendEvent(new StoppedEvent("entry", 1));
      this._trySendNextRequest();
    } else if (prefix === DebugMessage.BREAKPOINT_ADD_ACKNOWLEDGE) {
      this._processRequestCallback(requestID, message);
      // Prepack acknowledged adding a breakpoint
      this._prepackWaiting = true;
      this._trySendNextRequest();
    } else if (prefix === DebugMessage.BREAKPOINT_STOPPED_RESPONSE) {
      this._processRequestCallback(requestID, message);
      // Prepack stopped on a breakpoint
      this._prepackWaiting = true;
      // the second argument is the threadID required by the protocol, since
      // Prepack only has one thread, this argument will be ignored
      this.sendEvent(new StoppedEvent("breakpoint " + parts.slice(2).join(" "), 1));
      this._trySendNextRequest();
    }
  }

  _processRequestCallback(requestID: number, message: string) {
    invariant(requestID in this._pendingRequestCallbacks, "Request ID does not exist in pending requests: " + requestID);
    let callback = this._pendingRequestCallbacks[requestID];
    callback(message);
  }

  _addRequestCallback(requestID: number, callback: string => void) {
    invariant(!(requestID in this._pendingRequestCallbacks), "Request ID already exists in pending requests");
    this._pendingRequestCallbacks[requestID] = callback;
  }

  // Error handler for errors in files from the adapter channel
  _handleFileReadError(err: ?ErrnoError) {
    console.error(err);
    process.exit(1);
  }

  // Check to see if the next request to Prepack can be sent and send it if so
  _trySendNextRequest(): boolean {
    // check to see if Prepack is ready to accept another request
    if (!this._prepackWaiting) return false;
    // check that there is a message to send
    if (this._messageQueue.isEmpty()) return false;
    let request = this._messageQueue.dequeue();
    this._adapterChannel.listenOnFile(this._handleFileReadError.bind(this), this._processPrepackMessage.bind(this));
    this._adapterChannel.writeOut(request);
    this._prepackWaiting = false;
    return true;
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
    this._messageQueue.enqueue(`${response.request_seq} ${DebugMessage.PREPACK_RUN_COMMAND}`);
    this._trySendNextRequest();

    this._addRequestCallback(response.request_seq, (message: string) => {
      this.sendResponse(response);
    });
  }

  setBreakPointsRequest(
    response: DebugProtocol.SetBreakpointsResponse,
    args: DebugProtocol.SetBreakpointsArguments
  ): void {
    if (!args.source.path || !args.breakpoints) return;
    let filePath = args.source.path;

    for (const breakpoint of args.breakpoints) {
      let line = breakpoint.line;
      let column = 0;
      if (breakpoint.column) {
        column = breakpoint.column;
      }
      this._messageQueue.enqueue(
        `${response.request_seq} ${DebugMessage.BREAKPOINT_ADD_COMMAND} ${filePath} ${line} ${column}`
      );
    }
    this._trySendNextRequest();
    this._addRequestCallback(response.request_seq, (message: string) => {
      this.sendResponse(response);
    });
  }
}

DebugSession.run(PrepackDebugSession);
