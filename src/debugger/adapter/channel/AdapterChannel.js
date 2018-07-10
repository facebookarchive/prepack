/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */
import { FileIOWrapper } from "./../../common/channel/FileIOWrapper.js";
import { MessageMarshaller } from "./../../common/channel/MessageMarshaller.js";
import Queue from "queue-fifo";
import EventEmitter from "events";
import invariant from "./../../common/invariant.js";
import { DebugMessage } from "./../../common/channel/DebugMessage.js";
import child_process from "child_process";
import type { Breakpoint, DebuggerResponse, PrepackLaunchArguments } from "./../../common/types.js";

//Channel used by the debug adapter to communicate with Prepack
export class AdapterChannel {
  constructor(inFilePath: string, outFilePath: string) {
    this._ioWrapper = new FileIOWrapper(true, inFilePath, outFilePath);
    this._marshaller = new MessageMarshaller();
    this._queue = new Queue();
    this._pendingRequestCallbacks = new Map();
    this._eventEmitter = new EventEmitter();
  }
  _ioWrapper: FileIOWrapper;
  _marshaller: MessageMarshaller;
  _queue: Queue;
  _pendingRequestCallbacks: Map<number, (DebuggerResponse) => void>;
  _prepackWaiting: boolean;
  _eventEmitter: EventEmitter;
  _prepackProcess: child_process.ChildProcess;

  // Error handler for errors in files from the adapter channel
  _handleFileReadError(err: ?ErrnoError): void {
    console.error(err);
    process.exit(1);
  }

  _processPrepackMessage(message: string): void {
    let dbgResponse = this._marshaller.unmarshallResponse(message);
    if (dbgResponse.result.kind === "breakpoint-add") {
      this._eventEmitter.emit(DebugMessage.BREAKPOINT_ADD_ACKNOWLEDGE, dbgResponse.id, dbgResponse);
    } else if (dbgResponse.result.kind === "stopped") {
      this._eventEmitter.emit(DebugMessage.STOPPED_RESPONSE, dbgResponse);
    } else if (dbgResponse.result.kind === "stepInto") {
      this._eventEmitter.emit(DebugMessage.STEPINTO_RESPONSE, dbgResponse);
    }
    this._prepackWaiting = true;
    this._processRequestCallback(dbgResponse);
    this.trySendNextRequest();
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

  _addRequestCallback(requestID: number, callback: DebuggerResponse => void): void {
    invariant(!this._pendingRequestCallbacks.has(requestID), "Request ID already exists in pending requests");
    this._pendingRequestCallbacks.set(requestID, callback);
  }

  _processRequestCallback(response: DebuggerResponse): void {
    let callback = this._pendingRequestCallbacks.get(response.id);
    invariant(callback !== undefined, "Request ID does not exist in pending requests: " + response.id);
    callback(response);
    this._pendingRequestCallbacks.delete(response.id);
  }

  registerChannelEvent(event: string, listener: (response: DebuggerResponse) => void): void {
    this._eventEmitter.addListener(event, listener);
  }

  launch(requestID: number, args: PrepackLaunchArguments, callback: DebuggerResponse => void): void {
    this.sendDebuggerStart(requestID);
    this.listenOnFile(this._processPrepackMessage.bind(this));
    let prepackCommand = args.sourceFiles.concat(args.prepackArguments);
    // Note: here the input file for the adapter is the output file for Prepack, and vice versa.
    prepackCommand = prepackCommand.concat([
      "--debugInFilePath",
      args.debugOutFilePath,
      "--debugOutFilePath",
      args.debugInFilePath,
    ]);

    let runtime = "prepack";
    if (args.prepackRuntime.length > 0) {
      // user specified a Prepack path
      runtime = "node";
      // Increase node's memory allowance so Prepack can handle large inputs
      prepackCommand = ["--max_old_space_size=8192", "--stack_size=10000"]
        .concat([args.prepackRuntime])
        .concat(prepackCommand);
    }
    this._prepackProcess = child_process.spawn(runtime, prepackCommand);

    process.on("exit", () => {
      this._prepackProcess.kill();
      this.clean();
      process.exit();
    });

    process.on("SIGINT", () => {
      this._prepackProcess.kill();
      process.exit();
    });

    this._prepackProcess.stdout.on("data", args.outputCallback);

    this._prepackProcess.on("exit", args.exitCallback);
    this._addRequestCallback(requestID, callback);
  }

  run(requestID: number, callback: DebuggerResponse => void): void {
    this._queue.enqueue(this._marshaller.marshallContinueRequest(requestID));
    this.trySendNextRequest();
    this._addRequestCallback(requestID, callback);
  }

  setBreakpoints(requestID: number, breakpoints: Array<Breakpoint>, callback: DebuggerResponse => void): void {
    this._queue.enqueue(this._marshaller.marshallSetBreakpointsRequest(requestID, breakpoints));
    this.trySendNextRequest();
    this._addRequestCallback(requestID, callback);
  }

  getStackFrames(requestID: number, callback: DebuggerResponse => void): void {
    this._queue.enqueue(this._marshaller.marshallStackFramesRequest(requestID));
    this.trySendNextRequest();
    this._addRequestCallback(requestID, callback);
  }

  getScopes(requestID: number, frameId: number, callback: DebuggerResponse => void): void {
    this._queue.enqueue(this._marshaller.marshallScopesRequest(requestID, frameId));
    this.trySendNextRequest();
    this._addRequestCallback(requestID, callback);
  }

  getVariables(requestID: number, variablesReference: number, callback: DebuggerResponse => void): void {
    this._queue.enqueue(this._marshaller.marshallVariablesRequest(requestID, variablesReference));
    this.trySendNextRequest();
    this._addRequestCallback(requestID, callback);
  }

  stepInto(requestID: number, callback: DebuggerResponse => void): void {
    this._queue.enqueue(this._marshaller.marshallStepIntoRequest(requestID));
    this.trySendNextRequest();
    this._addRequestCallback(requestID, callback);
  }

  stepOver(requestID: number, callback: DebuggerResponse => void): void {
    this._queue.enqueue(this._marshaller.marshallStepOverRequest(requestID));
    this.trySendNextRequest();
    this._addRequestCallback(requestID, callback);
  }

  stepOut(requestID: number, callback: DebuggerResponse => void): void {
    this._queue.enqueue(this._marshaller.marshallStepOutRequest(requestID));
    this.trySendNextRequest();
    this._addRequestCallback(requestID, callback);
  }

  evaluate(requestID: number, frameId: void | number, expression: string, callback: DebuggerResponse => void): void {
    this._queue.enqueue(this._marshaller.marshallEvaluateRequest(requestID, frameId, expression));
    this.trySendNextRequest();
    this._addRequestCallback(requestID, callback);
  }

  writeOut(contents: string): void {
    this._ioWrapper.writeOutSync(contents);
  }

  sendDebuggerStart(requestID: number): void {
    this.writeOut(this._marshaller.marshallDebuggerStart(requestID));
  }

  listenOnFile(messageProcessor: (message: string) => void): void {
    this._ioWrapper.readIn(this._handleFileReadError.bind(this), messageProcessor);
  }

  clean(): void {
    this._ioWrapper.clearInFile();
    this._ioWrapper.clearOutFile();
  }
}
