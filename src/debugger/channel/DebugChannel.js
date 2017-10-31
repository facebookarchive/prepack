/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */
import invariant from "./../../invariant.js";
import { FileIOWrapper } from "./FileIOWrapper.js";
import { DebugMessage } from "./DebugMessage.js";
import { MessageFormatter } from "./MessageFormatter.js";
import { MessageParser } from "./MessageParser.js";
import { DebuggerError } from "./../DebuggerError.js";
import type {
  DebuggerRequest,
  DebuggerRequestArguments,
  BreakpointRequestArguments,
  RunRequestArguments,
} from "./../types.js";

//Channel used by the DebugServer in Prepack to communicate with the debug adapter
export class DebugChannel {
  constructor(ioWrapper: FileIOWrapper) {
    this._requestReceived = false;
    this._ioWrapper = ioWrapper;
    this._formatter = new MessageFormatter();
    this._parser = new MessageParser();
    this._lastRunRequestID = 0;
  }

  _requestReceived: boolean;
  _ioWrapper: FileIOWrapper;
  _formatter: MessageFormatter;
  _parser: MessageParser;
  _lastRunRequestID: number;

  /*
  /* Only called in the beginning to check if a debugger is attached
  */
  debuggerIsAttached(): boolean {
    let message = this._ioWrapper.readInSyncOnce();
    if (message === null) return false;
    let parts = message.split(" ");
    let requestID = parseInt(parts[0], 10);
    invariant(!isNaN(requestID), "Request ID must be a number");
    let command = parts[1];
    if (command === DebugMessage.DEBUGGER_ATTACHED) {
      this._requestReceived = true;
      this._ioWrapper.clearInFile();
      this.writeOut(`${requestID} ${DebugMessage.PREPACK_READY_RESPONSE}`);
      return true;
    }
    return false;
  }

  /* Reads in a request from the debug adapter
  /* The caller is responsible for sending a response with the appropriate
  /* contents at the right time.
  */
  readIn(): DebuggerRequest {
    let message = this._ioWrapper.readInSync();
    this._requestReceived = true;

    let parts = message.split(" ");
    // each request must have a length and a command
    invariant(parts.length >= 2, "Request is not well formed");
    // unique ID for each request
    let requestID = parseInt(parts[0], 10);
    invariant(!isNaN(requestID), "Request ID must be a number");
    let command = parts[1];
    let args: DebuggerRequestArguments;
    switch (command) {
      case DebugMessage.PREPACK_RUN_COMMAND:
        this._lastRunRequestID = requestID;
        let runArgs: RunRequestArguments = {
          kind: "run",
          requestID: requestID,
        };
        args = runArgs;
        break;
      case DebugMessage.BREAKPOINT_ADD_COMMAND:
        args = this._parser.parseBreakpointArguments(requestID, parts.slice(2));
        break;
      default:
        throw new DebuggerError("Invalid command", "Invalid command from adapter: " + command);
    }
    invariant(args !== undefined);
    let result: DebuggerRequest = {
      command: command,
      arguments: args,
    };
    return result;
  }

  // Write out a response to the debug adapter
  writeOut(contents: string): void {
    //Prepack only writes back to the debug adapter in response to a request
    invariant(this._requestReceived, "Prepack writing message without being requested: " + contents);
    this._ioWrapper.writeOutSync(contents);
    this._requestReceived = false;
  }

  sendBreakpointAcknowledge(prefix: string, args: BreakpointRequestArguments): void {
    this.writeOut(
      this._formatter.formatBreakpointAcknowledge(args.requestID, prefix, args.filePath, args.line, args.column)
    );
  }

  sendBreakpointStopped(filePath: string, line: number, column: number): void {
    this.writeOut(this._formatter.formatBreakpointStopped(this._lastRunRequestID, filePath, line, column));
  }

  sendPrepackFinish(): void {
    this.writeOut(this._formatter.formatPrepackFinish(this._lastRunRequestID));
  }
}
