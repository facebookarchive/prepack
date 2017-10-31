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
import { MessageFormatter } from "./MessageFormatter.js";
import Queue from "queue-fifo";
import EventEmitter from "events";
import invariant from "./../../invariant.js";
import { DebugMessage } from "./DebugMessage.js";
import { DebuggerConstants } from "./../DebuggerConstants.js";
import type { BreakpointRequestArguments } from "./../types.js";

//Channel used by the debug adapter to communicate with Prepack
export class AdapterChannel {
  constructor(dbgOptions: DebuggerOptions, eventEmitter: EventEmitter) {
    this._ioWrapper = new FileIOWrapper(true, dbgOptions.inFilePath, dbgOptions.outFilePath);
    this._formatter = new MessageFormatter();
    this._queue = new Queue();
    this._pendingRequestCallbacks = new Map();
    this._eventEmitter = eventEmitter;
    this.sendDebuggerStart(DebuggerConstants.DEFAULT_REQUEST_ID);
    this.listenOnFile(this._processPrepackMessage.bind(this));
  }
  _ioWrapper: FileIOWrapper;
  _formatter: MessageFormatter;
  _queue: Queue;
  _pendingRequestCallbacks: { [number]: (string) => void };
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
      this._prepackWaiting = true;
      this._eventEmitter.emit(DebugMessage.PREPACK_READY_RESPONSE);
      this.trySendNextRequest();
    } else if (prefix === DebugMessage.BREAKPOINT_ADD_ACKNOWLEDGE) {
      this._eventEmitter.emit(DebugMessage.BREAKPOINT_ADD_ACKNOWLEDGE, requestID, message);
      // Prepack acknowledged adding a breakpoint
      this._prepackWaiting = true;
      this._processRequestCallback(requestID, message);
      this.trySendNextRequest();
    } else if (prefix === DebugMessage.BREAKPOINT_STOPPED_RESPONSE) {
      this._eventEmitter.emit(DebugMessage.BREAKPOINT_STOPPED_RESPONSE, parts.slice(2).join(" "));
      // Prepack stopped on a breakpoint
      this._prepackWaiting = true;
      this._processRequestCallback(requestID, message);
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

  _addRequestCallback(requestID: number, callback: string => void) {
    invariant(!(requestID in this._pendingRequestCallbacks), "Request ID already exists in pending requests");
    this._pendingRequestCallbacks[requestID] = callback;
  }

  _processRequestCallback(requestID: number, message: string) {
    invariant(
      requestID in this._pendingRequestCallbacks,
      "Request ID does not exist in pending requests: " + requestID
    );
    let callback = this._pendingRequestCallbacks[requestID];
    callback(message);
  }

  queueContinueRequest(requestID: number, callback: string => void) {
    this._queue.enqueue(this._formatter.formatContinueRequest(requestID));
    this.trySendNextRequest();
    this._addRequestCallback(requestID, callback);
  }

  queueSetBreakpointsRequest(
    requestID: number,
    breakpoints: Array<BreakpointRequestArguments>,
    callback: string => void
  ) {
    for (const breakpoint of breakpoints) {
      this._queue.enqueue(
        this._formatter.formatSetBreakpointsRequest(requestID, breakpoint.filePath, breakpoint.line, breakpoint.column)
      );
    }
    this.trySendNextRequest();
    this._addRequestCallback(requestID, callback);
  }

  writeOut(contents: string) {
    this._ioWrapper.writeOutSync(contents);
  }

  sendDebuggerStart(requestID: number) {
    this.writeOut(this._formatter.formatDebuggerStart(requestID));
  }

  listenOnFile(messageProcessor: (message: string) => void) {
    this._ioWrapper.readIn(this._handleFileReadError.bind(this), messageProcessor);
  }

  clean() {
    this._ioWrapper.clearInFile();
    this._ioWrapper.clearOutFile();
  }
}
