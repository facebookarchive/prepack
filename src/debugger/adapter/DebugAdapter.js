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
import { AdapterChannel } from "./../channel/AdapterChannel.js";
import type { DebuggerOptions } from "./../../options.js";
import { getDebuggerOptions } from "./../../prepack-options.js";
import invariant from "./../../invariant.js";
import { DebugMessage } from "./../channel/DebugMessage.js";
import type { BreakpointArguments, DebuggerResponse, LaunchRequestArguments, PrepackLaunchArguments } from "./../types.js";
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
  }

  _prepackCommand: string;
  _inFilePath: string;
  _outFilePath: string;
  _prepackProcess: child_process.ChildProcess;
  _adapterChannel: AdapterChannel;
  _debuggerOptions: DebuggerOptions;
  _prepackWaiting: boolean;

  _registerMessageCallbacks() {
    this._adapterChannel.registerChannelEvent(DebugMessage.PREPACK_READY_RESPONSE, (response: DebuggerResponse) => {
      this.sendEvent(new StoppedEvent("entry", DebuggerConstants.PREPACK_THREAD_ID));
    });
    this._adapterChannel.registerChannelEvent(
      DebugMessage.BREAKPOINT_STOPPED_RESPONSE,
      (response: DebuggerResponse) => {
        let result = response.result;
        invariant(result.kind === "breakpoint-stopped");
        this.sendEvent(
          new StoppedEvent(
            "breakpoint " + `${result.filePath} ${result.line}:${result.column}`,
            DebuggerConstants.PREPACK_THREAD_ID
          )
        );
      }
    );
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

  launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments): void {
    this._prepackCommand = args.prepackCommand;
    this._inFilePath = args.inFilePath;
    this._outFilePath = args.outFilePath;
    // set up the communication channel
    this._adapterChannel = new AdapterChannel(this._inFilePath, this._outFilePath);
    this._registerMessageCallbacks();
    let launchArgs: PrepackLaunchArguments = {
      kind: "launch",
      prepackCommand: args.prepackCommand,
      inFilePath: args.inFilePath,
      outFilePath: args.outFilePath,
      outputCallback: (data: Buffer) => {
        let outputEvent = new OutputEvent(data.toString(), "stdout");
        this.sendEvent(outputEvent);
      },
      exitCallback: () => {
        this.sendEvent(new TerminatedEvent());
        process.exit();
      },
    };
    this._adapterChannel.launch(response.request_seq, launchArgs, (dbgResponse: DebuggerResponse) => {
      this.sendResponse(response);
    });
  }

  /**
   * Request Prepack to continue running when it is stopped
  */
  continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
    // send a Run request to Prepack and try to send the next request
    this._adapterChannel.run(response.request_seq, (dbgResponse: DebuggerResponse) => {
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
      let breakpointInfo: BreakpointArguments = {
        kind: "breakpoint",
        requestID: response.request_seq,
        filePath: filePath,
        line: line,
        column: column,
      };
      breakpointInfos.push(breakpointInfo);
    }
    this._adapterChannel.setBreakpoints(response.request_seq, breakpointInfos, (dbgResponse: DebuggerResponse) => {
      this.sendResponse(response);
    });
  }

  stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments): void {
    this._adapterChannel.getStackFrames(response.request_seq, (dbgResponse: DebuggerResponse) => {
      let result = dbgResponse.result;
      invariant(result.kind === "stackframe");
      let frameInfos = result.stackframes;
      let frames: Array<DebugProtocol.StackFrame> = [];
      for (const frameInfo of frameInfos) {
        let source: DebugProtocol.Source = {
          path: frameInfo.fileName,
        };
        let frame: DebugProtocol.StackFrame = {
          id: frameInfo.id,
          name: frameInfo.functionName,
          source: source,
          line: frameInfo.line,
          column: frameInfo.column,
        };
        frames.push(frame);
      }
      response.body = {
        stackFrames: frames,
      };
      this.sendResponse(response);
    });
  }

  threadsRequest(response: DebugProtocol.ThreadsResponse): void {
    // There will only be 1 thread, so respond immediately
    let thread: DebugProtocol.Thread = {
      id: DebuggerConstants.PREPACK_THREAD_ID,
      name: "main",
    };
    response.body = {
      threads: [thread],
    };
    this.sendResponse(response);
  }
}

DebugSession.run(PrepackDebugSession);
