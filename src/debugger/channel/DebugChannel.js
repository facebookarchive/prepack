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
import { MessageMarshaller } from "./MessageMarshaller.js";
import { DebuggerError } from "./../DebuggerError.js";
import type {
  DebuggerRequest,
  DebuggerRequestArguments,
  BreakpointArguments,
  RunArguments,
  StackframeArguments,
  Stackframe,
} from "./../types.js";

//Channel used by the DebugServer in Prepack to communicate with the debug adapter
export class DebugChannel {
  constructor(ioWrapper: FileIOWrapper) {
    this._requestReceived = false;
    this._ioWrapper = ioWrapper;
    this._marshaller = new MessageMarshaller();
    this._lastRunRequestID = 0;
  }

  _requestReceived: boolean;
  _ioWrapper: FileIOWrapper;
  _marshaller: MessageMarshaller;
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
        let runArgs: RunArguments = {
          kind: "run",
        };
        args = runArgs;
        break;
      case DebugMessage.BREAKPOINT_ADD_COMMAND:
        args = this._marshaller.unmarshallBreakpointArguments(requestID, parts.slice(2));
        break;
      case DebugMessage.STACKFRAMES_COMMAND:
        let stackFrameArgs: StackframeArguments = {
          kind: "stackframe",
        };
        args = stackFrameArgs;
        break;
      case DebugMessage.SCOPES_COMMAND:
        args = this._marshaller.unmarshallScopesArguments(requestID, parts[2]);
        break;
      default:
        throw new DebuggerError("Invalid command", "Invalid command from adapter: " + command);
    }
    invariant(args !== undefined);
    let result: DebuggerRequest = {
      id: requestID,
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

  sendBreakpointAcknowledge(messageType: string, requestID: number, args: BreakpointArguments): void {
    this.writeOut(
      this._marshaller.marshallBreakpointAcknowledge(requestID, messageType, args.filePath, args.line, args.column)
    );
  }

  sendBreakpointStopped(filePath: string, line: number, column: number): void {
    let breakpointInfo: BreakpointArguments = {
      kind: "breakpoint",
      filePath: filePath,
      line: line,
      column: column,
    };
    this.writeOut(this._marshaller.marshallBreakpointStopped(this._lastRunRequestID, breakpointInfo));
  }

  sendStackframeResponse(requestID: number, stackframes: Array<Stackframe>): void {
    this.writeOut(this._marshaller.marshallStackFramesResponse(requestID, stackframes));
  }

  sendPrepackFinish(): void {
    this.writeOut(this._marshaller.marshallPrepackFinish(this._lastRunRequestID));
  }
}
