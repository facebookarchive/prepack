/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import { DebugSession, InitializedEvent, OutputEvent, TerminatedEvent, StoppedEvent } from "vscode-debugadapter";
import * as DebugProtocol from "vscode-debugprotocol";
import { AdapterChannel } from "./channel/AdapterChannel.js";
import invariant from "./../common/invariant.js";
import { DebugMessage } from "./../common/channel/DebugMessage.js";
import type {
  Breakpoint,
  DebuggerResponse,
  LaunchRequestArguments,
  PrepackLaunchArguments,
} from "./../common/types.js";
import { DebuggerConstants } from "./../common/DebuggerConstants.js";
import { DebuggerError } from "./../common/DebuggerError.js";

/* An implementation of an debugger adapter adhering to the VSCode Debug protocol
 * The adapter is responsible for communication between the UI and Prepack
*/
class PrepackDebugSession extends DebugSession {
  /**
   * Creates a new debug adapter that is used for one debug session.
   * We configure the default implementation of a debug adapter here.
   */
  constructor() {
    super();
    this.setDebuggerLinesStartAt1(true);
    this.setDebuggerColumnsStartAt1(true);
  }
  _clientID: void | string;
  _adapterChannel: void | AdapterChannel;

  _generateDebugFilePath(direction: "in" | "out") {
    let time = Date.now();
    let filePath = "/tmp/";
    if (direction === "in") {
      filePath += `prepack-debug-engine2adapter-${time}.txt`;
    } else {
      filePath += `prepack-debug-adapter2engine-${time}.txt`;
    }
    return filePath;
  }

  _registerMessageCallbacks() {
    this._ensureAdapterChannelCreated("registerMessageCallbacks");
    invariant(this._adapterChannel !== undefined, "Adapter Channel used before it was created, in debugger.");
    // Create local copy to ensure external functions don't modify the adapterChannel, satisfy flow.
    let localCopyAdapterChannel = this._adapterChannel;
    localCopyAdapterChannel.registerChannelEvent(DebugMessage.STOPPED_RESPONSE, (response: DebuggerResponse) => {
      let result = response.result;
      invariant(result.kind === "stopped");
      let message = `${result.reason}: ${result.filePath} ${result.line}:${result.column}`;
      // Append message if there exists one (for Prepack errors)
      if (result.message !== undefined) {
        message += `. ${result.message}`;
      }
      this.sendEvent(new StoppedEvent(message, DebuggerConstants.PREPACK_THREAD_ID));
    });
    localCopyAdapterChannel.registerChannelEvent(DebugMessage.STEPINTO_RESPONSE, (response: DebuggerResponse) => {
      let result = response.result;
      invariant(result.kind === "stepInto");
      this.sendEvent(
        new StoppedEvent(
          "Stepped into " + `${result.filePath} ${result.line}:${result.column}`,
          DebuggerConstants.PREPACK_THREAD_ID
        )
      );
    });
  }

  /**
   * The 'initialize' request is the first request called by the UI
   * to interrogate the features the debug adapter provides.
   */
  // Override
  initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
    this._clientID = args.clientID;
    response.body = response.body || {};
    response.body.supportsConfigurationDoneRequest = true;
    // Respond back to the UI with the configurations. Will add more configurations gradually as needed.
    // Adapter can respond immediately here because no message is sent to Prepack
    this.sendResponse(response);
  }

  // Override
  configurationDoneRequest(
    response: DebugProtocol.ConfigurationDoneResponse,
    args: DebugProtocol.ConfigurationDoneArguments
  ): void {
    // initial handshake with UI is complete
    if (this._clientID !== DebuggerConstants.CLI_CLIENTID) {
      this._ensureAdapterChannelCreated("configurationDoneRequest");
      invariant(this._adapterChannel !== undefined, "Adapter Channel used before it was created, in debugger.");
      // for all ui except the CLI, autosend the first run request
      this._adapterChannel.run(DebuggerConstants.DEFAULT_REQUEST_ID, (runResponse: DebuggerResponse) => {});
    }
    this.sendResponse(response);
  }

  // Override
  launchRequest(response: DebugProtocol.LaunchResponse, args: LaunchRequestArguments): void {
    let inFilePath = this._generateDebugFilePath("in");
    let outFilePath = this._generateDebugFilePath("out");
    // Set up the communication channel to the debugger.
    let adapterChannel = new AdapterChannel(inFilePath, outFilePath);
    this._adapterChannel = adapterChannel;
    this._registerMessageCallbacks();
    let launchArgs: PrepackLaunchArguments = {
      kind: "launch",
      sourceFiles: args.sourceFiles,
      prepackRuntime: args.prepackRuntime,
      prepackArguments: args.prepackArguments,
      debugInFilePath: inFilePath,
      debugOutFilePath: outFilePath,
      outputCallback: (data: Buffer) => {
        let outputEvent = new OutputEvent(data.toString(), "stdout");
        this.sendEvent(outputEvent);
      },
      exitCallback: () => {
        this.sendEvent(new TerminatedEvent());
        process.exit();
      },
    };

    adapterChannel.launch(response.request_seq, launchArgs, (dbgResponse: DebuggerResponse) => {
      this.sendResponse(response);
    });

    // Important: InitializedEvent indicates to the protocol that further requests (e.g. breakpoints, execution control)
    // are ready to be received. Prepack debugger is not ready to receive these requests until the Adapter Channel
    // has been created and Prepack has been launched. Thus, the InitializedEvent is sent after Prepack launch and
    // the creation of the Adapter Channel.
    this.sendEvent(new InitializedEvent());
  }

  /**
   * Request Prepack to continue running when it is stopped
   */
  // Override
  continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
    // send a Run request to Prepack and try to send the next request
    this._ensureAdapterChannelCreated("continueRequest");
    invariant(this._adapterChannel !== undefined, "Adapter Channel used before it was created, in debugger.");
    this._adapterChannel.run(response.request_seq, (dbgResponse: DebuggerResponse) => {
      this.sendResponse(response);
    });
  }

  // Override
  setBreakPointsRequest(
    response: DebugProtocol.SetBreakpointsResponse,
    args: DebugProtocol.SetBreakpointsArguments
  ): void {
    if (args.source.path === undefined || args.breakpoints === undefined) return;
    let filePath = args.source.path;
    let breakpointInfos = [];
    for (const breakpoint of args.breakpoints) {
      let line = breakpoint.line;
      let column = 0;
      if (breakpoint.column !== undefined) {
        column = breakpoint.column;
      }
      let breakpointInfo: Breakpoint = {
        kind: "breakpoint",
        requestID: response.request_seq,
        filePath: filePath,
        line: line,
        column: column,
      };
      breakpointInfos.push(breakpointInfo);
    }

    this._ensureAdapterChannelCreated("setBreakPointsRequest");
    invariant(this._adapterChannel !== undefined, "Adapter Channel used before it was created, in debugger.");
    this._adapterChannel.setBreakpoints(response.request_seq, breakpointInfos, (dbgResponse: DebuggerResponse) => {
      let result = dbgResponse.result;
      invariant(result.kind === "breakpoint-add");
      let breakpoints: Array<DebugProtocol.Breakpoint> = [];
      for (const breakpointInfo of result.breakpoints) {
        let source: DebugProtocol.Source = {
          path: breakpointInfo.filePath,
        };
        let breakpoint: DebugProtocol.Breakpoint = {
          verified: true,
          source: source,
          line: breakpointInfo.line,
          column: breakpointInfo.column,
        };
        breakpoints.push(breakpoint);
      }
      response.body = {
        breakpoints: breakpoints,
      };
      this.sendResponse(response);
    });
  }

  // Override
  stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments): void {
    this._ensureAdapterChannelCreated("stackTraceRequest");
    invariant(this._adapterChannel !== undefined);
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

  // Override
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

  // Override
  scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): void {
    this._ensureAdapterChannelCreated("scopesRequest");
    invariant(this._adapterChannel !== undefined, "Adapter Channel used before it was created, in debugger.");
    this._adapterChannel.getScopes(response.request_seq, args.frameId, (dbgResponse: DebuggerResponse) => {
      let result = dbgResponse.result;
      invariant(result.kind === "scopes");
      let scopeInfos = result.scopes;
      let scopes: Array<DebugProtocol.Scope> = [];
      for (const scopeInfo of scopeInfos) {
        let scope: DebugProtocol.Scope = {
          name: scopeInfo.name,
          variablesReference: scopeInfo.variablesReference,
          expensive: scopeInfo.expensive,
        };
        scopes.push(scope);
      }
      response.body = {
        scopes: scopes,
      };
      this.sendResponse(response);
    });
  }

  // Override
  variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments): void {
    this._ensureAdapterChannelCreated("variablesRequest");
    invariant(this._adapterChannel !== undefined, "Adapter Channel used before it was created, in debugger.");
    this._adapterChannel.getVariables(
      response.request_seq,
      args.variablesReference,
      (dbgResponse: DebuggerResponse) => {
        let result = dbgResponse.result;
        invariant(result.kind === "variables");
        let variableInfos = result.variables;
        let variables: Array<DebugProtocol.Variable> = [];
        for (const varInfo of variableInfos) {
          let variable: DebugProtocol.Variable = {
            name: varInfo.name,
            value: varInfo.value,
            variablesReference: varInfo.variablesReference,
          };
          variables.push(variable);
        }
        response.body = {
          variables: variables,
        };
        this.sendResponse(response);
      }
    );
  }

  // Override
  stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments): void {
    this._ensureAdapterChannelCreated("stepInRequest");
    invariant(this._adapterChannel !== undefined, "Adapter Channel used before it was created, in debugger.");
    this._adapterChannel.stepInto(response.request_seq, (dbgResponse: DebuggerResponse) => {
      this.sendResponse(response);
    });
  }

  // Override
  nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {
    this._ensureAdapterChannelCreated("nextRequest");
    invariant(this._adapterChannel !== undefined, "Adapter Channel used before it was created, in debugger.");
    this._adapterChannel.stepOver(response.request_seq, (dbgResponse: DebuggerResponse) => {
      this.sendResponse(response);
    });
  }

  // Override
  stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments): void {
    this._ensureAdapterChannelCreated("stepOutRequest");
    invariant(this._adapterChannel !== undefined, "Adapter Channel used before it was created, in debugger.");
    this._adapterChannel.stepOut(response.request_seq, (dbgResponse: DebuggerResponse) => {
      this.sendResponse(response);
    });
  }

  // Override
  evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): void {
    this._ensureAdapterChannelCreated("evaluateRequest");
    invariant(this._adapterChannel !== undefined, "Adapter Channel used before it was created, in debugger.");
    this._adapterChannel.evaluate(
      response.request_seq,
      args.frameId,
      args.expression,
      (dbgResponse: DebuggerResponse) => {
        let evalResult = dbgResponse.result;
        invariant(evalResult.kind === "evaluate");
        response.body = {
          result: evalResult.displayValue,
          type: evalResult.type,
          variablesReference: evalResult.variablesReference,
        };
        this.sendResponse(response);
      }
    );
  }

  _ensureAdapterChannelCreated(callingRequest: string) {
    // All responses that involve the Adapter Channel should only be invoked
    // after the channel has been created. If this ordering is perturbed,
    // there was likely a change in the protocol implementation by Nuclide.
    if (this._adapterChannel === undefined) {
      throw new DebuggerError(
        "Startup Error",
        `Adapter Channel in Debugger is being used before it has been created. Caused by ${callingRequest}.`
      );
    }
  }
}

DebugSession.run(PrepackDebugSession);
