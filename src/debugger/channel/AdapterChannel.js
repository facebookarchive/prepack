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

//Channel used by the debug adapter to communicate with Prepack
export class AdapterChannel {
  constructor(dbgOptions: DebuggerOptions) {
    this._ioWrapper = new FileIOWrapper(true, dbgOptions.inFilePath, dbgOptions.outFilePath);
    this._formatter = new MessageFormatter();
    this._queue = new Queue();
    this._prepackWaiting = false;
  }
  _ioWrapper: FileIOWrapper;
  _formatter: MessageFormatter;
  _queue: Queue;
  _prepackWaiting: boolean;

  // Error handler for errors in files from the adapter channel
  _handleFileReadError(err: ?ErrnoError) {
    console.error(err);
    process.exit(1);
  }

  setPrepackWaiting(value: boolean) {
    this._prepackWaiting = value;
  }

  // Check to see if the next request to Prepack can be sent and send it if so
  trySendNextRequest(messageProcessor: (message: string) => void): boolean {
    // check to see if Prepack is ready to accept another request
    if (!this._prepackWaiting) return false;
    // check that there is a message to send
    if (this._queue.isEmpty()) return false;
    let request = this._queue.dequeue();
    this.listenOnFile(messageProcessor);
    this.writeOut(request);
    this._prepackWaiting = false;
    return true;
  }

  queueContinueRequest(requestID: number) {
    this._queue.enqueue(this._formatter.formatContinueRequest(requestID));
  }

  queueSetBreakpointsRequest(requestID: number, filePath: string, line: number, column: number) {
    this._queue.enqueue(this._formatter.formatSetBreakpointsRequest(requestID, filePath, line, column));
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
