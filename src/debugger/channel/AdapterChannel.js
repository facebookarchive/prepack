/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */
import type { DebuggerOptions } from "./../../options.js";
import { FileIOWrapper } from "./FileIOWrapper.js";
import { MessageMarshaller } from "./MessageMarshaller.js";
import Queue from "queue-fifo";
import EventEmitter from "events";
import invariant from "./../../invariant.js";
import { DebugMessage } from "./DebugMessage.js";
import { DebuggerConstants } from "./../DebuggerConstants.js";
import type { BreakpointArguments, DebuggerResponse } from "./../types.js";

//Channel used by the debug adapter to communicate with Prepack
export class AdapterChannel {
  constructor(dbgOptions: DebuggerOptions) {
    this._ioWrapper = new FileIOWrapper(true, dbgOptions.inFilePath, dbgOptions.outFilePath);
    this._marshaller = new MessageMarshaller();
    this._queue = new Queue();
    this._pendingRequestCallbacks = new Map();
    this._eventEmitter = new EventEmitter();
    this.sendDebuggerStart(DebuggerConstants.DEFAULT_REQUEST_ID);
    this.listenOnFile(this._processPrepackMessage.bind(this));
  }
  _ioWrapper: FileIOWrapper;
  _marshaller: MessageMarshaller;
  _queue: Queue;
  _pendingRequestCallbacks: { [number]: (DebuggerResponse) => void };
  _prepackWaiting: boolean;
  _eventEmitter: EventEmitter;

  // Error handler for errors in files from the adapter channel
  _handleFileReadError(err: ?ErrnoError) {
    console.error(err);
    process.exit(1);
  }

  _processPrepackMessage(message: string) {
    let parts = message.split(" ");
    let requestID = parseInt(parts[0], 10);
    invariant(!isNaN(requestID));
    let prefix = parts[1];
    if (prefix === DebugMessage.PREPACK_READY_RESPONSE) {
      let result = this._marshaller.unmarshallReadyResponse(requestID);
      this._prepackWaiting = true;
      this._eventEmitter.emit(DebugMessage.PREPACK_READY_RESPONSE, result);
      this.trySendNextRequest();
    } else if (prefix === DebugMessage.BREAKPOINT_ADD_ACKNOWLEDGE) {
      let result = this._marshaller.unmarshallBreakpointAddResponse(requestID);
      this._eventEmitter.emit(DebugMessage.BREAKPOINT_ADD_ACKNOWLEDGE, requestID, result);
      // Prepack acknowledged adding a breakpoint
      this._prepackWaiting = true;
      this._processRequestCallback(requestID, result);
      this.trySendNextRequest();
    } else if (prefix === DebugMessage.BREAKPOINT_STOPPED_RESPONSE) {
      let result = this._marshaller.unmarshallBreakpointStoppedResponse(requestID, parts.slice(2));
      this._eventEmitter.emit(DebugMessage.BREAKPOINT_STOPPED_RESPONSE, result);
      // Prepack stopped on a breakpoint
      this._prepackWaiting = true;
      this._processRequestCallback(requestID, result);
      this.trySendNextRequest();
    } else if (prefix === DebugMessage.STACKFRAMES_RESPONSE) {
      let result = this._marshaller.unmarshallStackframesResponse(requestID, parts.slice(2).join(" "));
      this._prepackWaiting = true;
      this._processRequestCallback(requestID, result);
      this.trySendNextRequest();
    }
  }

  // Check to see if the next request to Prepack can be sent and send it if so
  trySendNextRequest(): boolean {
    // check to see if Prepack is ready to accept another request
    if (!this._prepackWaiting) return false;
    // check that there is a message to send
    if (this._queue.isEmpty()) return false;
    let request = this._queue.dequeue();
    this.listenOnFile(this._processPrepackMessage.bind(this));
    this.writeOut(request);
    this._prepackWaiting = false;
    return true;
  }

  _addRequestCallback(requestID: number, callback: DebuggerResponse => void) {
    invariant(!(requestID in this._pendingRequestCallbacks), "Request ID already exists in pending requests");
    this._pendingRequestCallbacks[requestID] = callback;
  }

  _processRequestCallback(requestID: number, result: DebuggerResponse) {
    invariant(
      requestID in this._pendingRequestCallbacks,
      "Request ID does not exist in pending requests: " + requestID
    );
    let callback = this._pendingRequestCallbacks[requestID];
    callback(result);
  }

  registerChannelEvent(event: string, listener: (result: DebuggerResponse) => void) {
    this._eventEmitter.addListener(event, listener);
  }

  run(requestID: number, callback: DebuggerResponse => void) {
    this._queue.enqueue(this._marshaller.marshallContinueRequest(requestID));
    this.trySendNextRequest();
    this._addRequestCallback(requestID, callback);
  }

  setBreakpoints(requestID: number, breakpoints: Array<BreakpointArguments>, callback: DebuggerResponse => void) {
    for (const breakpoint of breakpoints) {
      this._queue.enqueue(this._marshaller.marshallSetBreakpointsRequest(requestID, breakpoint));
    }
    this.trySendNextRequest();
    this._addRequestCallback(requestID, callback);
  }

  getStackFrames(requestID: number, callback: DebuggerResponse => void) {
    this._queue.enqueue(this._marshaller.marshallStackFramesRequest(requestID));
    this.trySendNextRequest();
    this._addRequestCallback(requestID, callback);
  }

  writeOut(contents: string) {
    this._ioWrapper.writeOutSync(contents);
  }

  sendDebuggerStart(requestID: number) {
    this.writeOut(this._marshaller.marshallDebuggerStart(requestID));
  }

  listenOnFile(messageProcessor: (message: string) => void) {
    this._ioWrapper.readIn(this._handleFileReadError.bind(this), messageProcessor);
  }

  clean() {
    this._ioWrapper.clearInFile();
    this._ioWrapper.clearOutFile();
  }
}
