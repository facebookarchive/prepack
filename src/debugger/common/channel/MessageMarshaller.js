/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */
import { DebugMessage } from "./DebugMessage.js";
import type {
  Breakpoint,
  BreakpointsArguments,
  ScopesArguments,
  Stackframe,
  DebuggerResponse,
  StackframeResult,
  BreakpointsAddResult,
  StoppedResult,
  ReadyResult,
  Scope,
  ScopesResult,
  Variable,
  VariablesArguments,
  VariablesResult,
  DebuggerRequest,
  DebuggerRequestArguments,
  RunArguments,
  StackframeArguments,
  StepIntoArguments,
  StepOverArguments,
  StoppedReason,
  EvaluateArguments,
  EvaluateResult,
} from "./../types.js";
import invariant from "./../invariant.js";
import { DebuggerError } from "./../DebuggerError.js";

export class MessageMarshaller {
  constructor() {
    this._lastRunRequestID = 0;
  }
  _lastRunRequestID: number;

  marshallBreakpointAcknowledge(requestID: number, messageType: string, breakpoints: Array<Breakpoint>): string {
    return `${requestID} ${messageType} ${JSON.stringify(breakpoints)}`;
  }

  marshallStoppedResponse(reason: StoppedReason, filePath: string, line: number, column: number): string {
    let result: StoppedResult = {
      kind: "stopped",
      reason: reason,
      filePath: filePath,
      line: line,
      column: column,
    };
    return `${this._lastRunRequestID} ${DebugMessage.STOPPED_RESPONSE} ${JSON.stringify(result)}`;
  }

  marshallDebuggerStart(requestID: number): string {
    return `${requestID} ${DebugMessage.DEBUGGER_ATTACHED}`;
  }

  marshallContinueRequest(requestID: number): string {
    return `${requestID} ${DebugMessage.PREPACK_RUN_COMMAND}`;
  }

  marshallSetBreakpointsRequest(requestID: number, breakpoints: Array<Breakpoint>): string {
    return `${requestID} ${DebugMessage.BREAKPOINT_ADD_COMMAND} ${JSON.stringify(breakpoints)}`;
  }

  marshallStackFramesRequest(requestID: number): string {
    return `${requestID} ${DebugMessage.STACKFRAMES_COMMAND}`;
  }

  marshallStackFramesResponse(requestID: number, stackframes: Array<Stackframe>): string {
    return `${requestID} ${DebugMessage.STACKFRAMES_RESPONSE} ${JSON.stringify(stackframes)}`;
  }

  marshallScopesRequest(requestID: number, frameId: number): string {
    return `${requestID} ${DebugMessage.SCOPES_COMMAND} ${frameId}`;
  }

  marshallScopesResponse(requestID: number, scopes: Array<Scope>): string {
    return `${requestID} ${DebugMessage.SCOPES_RESPONSE} ${JSON.stringify(scopes)}`;
  }

  marshallVariablesRequest(requestID: number, variablesReference: number): string {
    return `${requestID} ${DebugMessage.VARIABLES_COMMAND} ${variablesReference}`;
  }

  marshallVariablesResponse(requestID: number, variables: Array<Variable>): string {
    return `${requestID} ${DebugMessage.VARIABLES_RESPONSE} ${JSON.stringify(variables)}`;
  }

  marshallStepIntoRequest(requestID: number): string {
    return `${requestID} ${DebugMessage.STEPINTO_COMMAND}`;
  }

  marshallStepOverRequest(requestID: number): string {
    return `${requestID} ${DebugMessage.STEPOVER_COMMAND}`;
  }

  marshallEvaluateRequest(requestID: number, frameId: void | number, expression: string): string {
    let evalArgs: EvaluateArguments = {
      kind: "evaluate",
      expression: expression,
    };
    if (frameId !== undefined) {
      evalArgs.frameId = frameId;
    }
    return `${requestID} ${DebugMessage.EVALUATE_COMMAND} ${JSON.stringify(evalArgs)}`;
  }

  marshallEvaluateResponse(requestID: number, evalResult: EvaluateResult): string {
    return `${requestID} ${DebugMessage.EVALUATE_RESPONSE} ${JSON.stringify(evalResult)}`;
  }

  unmarshallRequest(message: string): DebuggerRequest {
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
        args = this._unmarshallBreakpointsArguments(requestID, parts.slice(2).join(" "));
        break;
      case DebugMessage.STACKFRAMES_COMMAND:
        let stackFrameArgs: StackframeArguments = {
          kind: "stackframe",
        };
        args = stackFrameArgs;
        break;
      case DebugMessage.SCOPES_COMMAND:
        args = this._unmarshallScopesArguments(requestID, parts[2]);
        break;
      case DebugMessage.VARIABLES_COMMAND:
        args = this._unmarshallVariablesArguments(requestID, parts[2]);
        break;
      case DebugMessage.STEPINTO_COMMAND:
        this._lastRunRequestID = requestID;
        let stepIntoArgs: StepIntoArguments = {
          kind: "stepInto",
        };
        args = stepIntoArgs;
        break;
      case DebugMessage.STEPOVER_COMMAND:
        this._lastRunRequestID = requestID;
        let stepOverArgs: StepOverArguments = {
          kind: "stepOver",
        };
        args = stepOverArgs;
        break;
      case DebugMessage.EVALUATE_COMMAND:
        args = this._unmarshallEvaluateArguments(requestID, parts.slice(2).join(" "));
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

  _unmarshallBreakpointsArguments(requestID: number, responseString: string): BreakpointsArguments {
    let breakpoints = JSON.parse(responseString);
    for (const breakpoint of breakpoints) {
      invariant(breakpoint.hasOwnProperty("filePath"), "breakpoint missing filePath property");
      invariant(breakpoint.hasOwnProperty("line"), "breakpoint missing line property");
      invariant(breakpoint.hasOwnProperty("column"), "breakpoint missing column property");
      invariant(!isNaN(breakpoint.line));
      invariant(!isNaN(breakpoint.column));
    }
    let result: BreakpointsArguments = {
      kind: "breakpoint",
      breakpoints: breakpoints,
    };
    return result;
  }

  _unmarshallScopesArguments(requestID: number, responseString: string): ScopesArguments {
    let frameId = parseInt(responseString, 10);
    invariant(!isNaN(frameId));
    let result: ScopesArguments = {
      kind: "scopes",
      frameId: frameId,
    };
    return result;
  }

  _unmarshallVariablesArguments(requestID: number, responseString: string): VariablesArguments {
    let varRef = parseInt(responseString, 10);
    invariant(!isNaN(varRef));
    let result: VariablesArguments = {
      kind: "variables",
      variablesReference: varRef,
    };
    return result;
  }

  _unmarshallEvaluateArguments(requestID: number, responseString: string): EvaluateArguments {
    let evalArgs = JSON.parse(responseString);
    invariant(evalArgs.hasOwnProperty("kind"), "Evaluate arguments missing kind field");
    invariant(evalArgs.hasOwnProperty("expression"), "Evaluate arguments missing expression field");
    if (evalArgs.hasOwnProperty("frameId")) invariant(!isNaN(evalArgs.frameId));
    return evalArgs;
  }

  unmarshallResponse(message: string): DebuggerResponse {
    try {
      let parts = message.split(" ");
      let requestID = parseInt(parts[0], 10);
      invariant(!isNaN(requestID));
      let messageType = parts[1];
      let dbgResult;
      let resultString = parts.slice(2).join(" ");
      if (messageType === DebugMessage.PREPACK_READY_RESPONSE) {
        dbgResult = this._unmarshallReadyResult();
      } else if (messageType === DebugMessage.BREAKPOINT_ADD_ACKNOWLEDGE) {
        dbgResult = this._unmarshallBreakpointsAddResult(resultString);
      } else if (messageType === DebugMessage.STOPPED_RESPONSE) {
        dbgResult = this._unmarshallStoppedResult(resultString);
      } else if (messageType === DebugMessage.STACKFRAMES_RESPONSE) {
        dbgResult = this._unmarshallStackframesResult(resultString);
      } else if (messageType === DebugMessage.SCOPES_RESPONSE) {
        dbgResult = this._unmarshallScopesResult(resultString);
      } else if (messageType === DebugMessage.VARIABLES_RESPONSE) {
        dbgResult = this._unmarshallVariablesResult(resultString);
      } else if (messageType === DebugMessage.EVALUATE_RESPONSE) {
        dbgResult = this._unmarshallEvaluateResult(resultString);
      } else {
        invariant(false, "Unexpected response type");
      }

      let dbgResponse: DebuggerResponse = {
        id: requestID,
        result: dbgResult,
      };
      return dbgResponse;
    } catch (e) {
      throw new DebuggerError("Invalid command", e.message);
    }
  }

  _unmarshallStackframesResult(resultString: string): StackframeResult {
    let frames = JSON.parse(resultString);
    invariant(Array.isArray(frames), "Stack frames is not an array");
    for (const frame of frames) {
      invariant(frame.hasOwnProperty("id"), "Stack frame is missing id");
      invariant(frame.hasOwnProperty("fileName"), "Stack frame is missing filename");
      invariant(frame.hasOwnProperty("line"), "Stack frame is missing line number");
      invariant(frame.hasOwnProperty("column"), "Stack frame is missing column number");
      invariant(frame.hasOwnProperty("functionName"), "Stack frame is missing function name");
    }
    let result: StackframeResult = {
      kind: "stackframe",
      stackframes: frames,
    };
    return result;
  }

  _unmarshallScopesResult(resultString: string): ScopesResult {
    let scopes = JSON.parse(resultString);
    invariant(Array.isArray(scopes), "Scopes is not an array");
    for (const scope of scopes) {
      invariant(scope.hasOwnProperty("name"), "Scope is missing name");
      invariant(scope.hasOwnProperty("variablesReference"), "Scope is missing variablesReference");
      invariant(scope.hasOwnProperty("expensive"), "Scope is missing expensive");
    }
    let result: ScopesResult = {
      kind: "scopes",
      scopes: scopes,
    };
    return result;
  }

  _unmarshallVariablesResult(resultString: string): VariablesResult {
    let variables = JSON.parse(resultString);
    invariant(Array.isArray(variables), "Variables is not an array");
    for (const variable of variables) {
      invariant(variable.hasOwnProperty("name"));
      invariant(variable.hasOwnProperty("value"));
      invariant(variable.hasOwnProperty("variablesReference"));
    }
    let result: VariablesResult = {
      kind: "variables",
      variables: variables,
    };
    return result;
  }

  _unmarshallEvaluateResult(resultString: string): EvaluateResult {
    let evalResult = JSON.parse(resultString);
    invariant(evalResult.hasOwnProperty("kind"), "eval result missing kind property");
    invariant(evalResult.kind === "evaluate", "eval result is the wrong kind");
    invariant(evalResult.hasOwnProperty("displayValue", "eval result missing display value property"));
    invariant(evalResult.hasOwnProperty("type", "eval result missing type property"));
    invariant(evalResult.hasOwnProperty("variablesReference", "eval result missing variablesReference property"));
    return evalResult;
  }

  _unmarshallBreakpointsAddResult(resultString: string): BreakpointsAddResult {
    let breakpoints = JSON.parse(resultString);
    invariant(Array.isArray(breakpoints));
    for (const breakpoint of breakpoints) {
      invariant(breakpoint.hasOwnProperty("filePath"), "breakpoint missing filePath property");
      invariant(breakpoint.hasOwnProperty("line"), "breakpoint missing line property");
      invariant(breakpoint.hasOwnProperty("column"), "breakpoint missing column property");
      invariant(!isNaN(breakpoint.line));
      invariant(!isNaN(breakpoint.column));
    }

    let result: BreakpointsAddResult = {
      kind: "breakpoint-add",
      breakpoints: breakpoints,
    };
    return result;
  }

  _unmarshallStoppedResult(resultString: string): StoppedResult {
    let result = JSON.parse(resultString);
    invariant(result.kind === "stopped");
    invariant(result.hasOwnProperty("reason"));
    invariant(result.hasOwnProperty("filePath"));
    invariant(result.hasOwnProperty("line"));
    invariant(!isNaN(result.line));
    invariant(result.hasOwnProperty("column"));
    invariant(!isNaN(result.column));
    return result;
  }

  _unmarshallReadyResult(): ReadyResult {
    let result: ReadyResult = {
      kind: "ready",
    };
    return result;
  }
}
