/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */
import invariant from "./../../common/invariant.js";
import { FileIOWrapper } from "./../../common/channel/FileIOWrapper.js";
import { DebugMessage } from "./../../common/channel/DebugMessage.js";
import { MessageMarshaller } from "./../../common/channel/MessageMarshaller.js";
import type {
  DebuggerRequest,
  BreakpointsArguments,
  Stackframe,
  Scope,
  Variable,
  StoppedReason,
  EvaluateResult,
} from "./../../common/types.js";

//Channel used by the DebugServer in Prepack to communicate with the debug adapter
export class DebugChannel {
  constructor(ioWrapper: FileIOWrapper) {
    this._requestReceived = false;
    this._ioWrapper = ioWrapper;
    this._marshaller = new MessageMarshaller();
  }

  _requestReceived: boolean;
  _ioWrapper: FileIOWrapper;
  _marshaller: MessageMarshaller;

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
    return this._marshaller.unmarshallRequest(message);
  }

  // Write out a response to the debug adapter
  writeOut(contents: string): void {
    //Prepack only writes back to the debug adapter in response to a request
    invariant(this._requestReceived, "Prepack writing message without being requested: " + contents);
    this._ioWrapper.writeOutSync(contents);
    this._requestReceived = false;
  }

  sendBreakpointsAcknowledge(messageType: string, requestID: number, args: BreakpointsArguments): void {
    this.writeOut(this._marshaller.marshallBreakpointAcknowledge(requestID, messageType, args.breakpoints));
  }

  sendStoppedResponse(reason: StoppedReason, filePath: string, line: number, column: number, message?: string): void {
    this.writeOut(this._marshaller.marshallStoppedResponse(reason, filePath, line, column, message));
  }

  sendStackframeResponse(requestID: number, stackframes: Array<Stackframe>): void {
    this.writeOut(this._marshaller.marshallStackFramesResponse(requestID, stackframes));
  }

  sendScopesResponse(requestID: number, scopes: Array<Scope>): void {
    this.writeOut(this._marshaller.marshallScopesResponse(requestID, scopes));
  }

  sendVariablesResponse(requestID: number, variables: Array<Variable>): void {
    this.writeOut(this._marshaller.marshallVariablesResponse(requestID, variables));
  }

  sendEvaluateResponse(requestID: number, evalResult: EvaluateResult): void {
    this.writeOut(this._marshaller.marshallEvaluateResponse(requestID, evalResult));
  }

  shutdown() {
    this._ioWrapper.clearInFile();
    this._ioWrapper.clearOutFile();
  }
}
