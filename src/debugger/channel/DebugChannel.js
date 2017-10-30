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

//Channel used by the DebugServer in Prepack to communicate with the debug adapter
export class DebugChannel {
  constructor(ioWrapper: FileIOWrapper) {
    this._requestReceived = false;
    this._ioWrapper = ioWrapper;
    this._formatter = new MessageFormatter();
  }

  _requestReceived: boolean;
  _ioWrapper: FileIOWrapper;
  _formatter: MessageFormatter;

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
  readIn(): string {
    let message = this._ioWrapper.readInSync();
    this._requestReceived = true;
    return message;
  }

  // Write out a response to the debug adapter
  writeOut(contents: string): void {
    //Prepack only writes back to the debug adapter in response to a request
    invariant(this._requestReceived, "Prepack writing message without being requested: " + contents);
    this._ioWrapper.writeOutSync(contents);
    this._requestReceived = false;
  }

  sendBreakpointAcknowledge(requestID: number, prefix: string, filePath: string, line: number, column: number): void {
    this.writeOut(this._formatter.formatBreakpointAcknowledge(requestID, prefix, filePath, line, column));
  }

  sendBreakpointStopped(requestID: number, filePath: string, line: number, column: number): void {
    this.writeOut(this._formatter.formatBreakpointStopped(requestID, filePath, line, column));
  }

  sendPrepackFinish(requestID: number): void {
    this.writeOut(this._formatter.formatPrepackFinish(requestID));
  }
}
