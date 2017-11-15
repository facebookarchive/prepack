/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */
import { DebugMessage } from "./DebugMessage.js";
import type {
  Breakpoint,
  BreakpointsArguments,
  ScopesArguments,
  Stackframe,
  DebuggerResponse,
  StackframeResult,
  BreakpointsAddResult,
  BreakpointStoppedResult,
  ReadyResult,
  Scope,
  ScopesResult,
  Variable,
  VariablesArguments,
  VariablesResult,
} from "./../types.js";
import invariant from "./../../invariant.js";
import { DebuggerError } from "./../DebuggerError.js";

export class MessageMarshaller {
  marshallBreakpointAcknowledge(requestID: number, messageType: string, breakpoints: Array<Breakpoint>): string {
    return `${requestID} ${messageType} ${JSON.stringify(breakpoints)}`;
  }

  marshallBreakpointStopped(requestID: number, args: Breakpoint): string {
    return `${requestID} ${DebugMessage.BREAKPOINT_STOPPED_RESPONSE} ${args.filePath} ${args.line} ${args.column}`;
  }

  marshallPrepackFinish(requestID: number): string {
    return `${requestID} ${DebugMessage.PREPACK_FINISH_RESPONSE}`;
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

  unmarshallBreakpointsArguments(requestID: number, breakpointsString: string): BreakpointsArguments {
    try {
      let breakpoints = JSON.parse(breakpointsString);
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
    } catch (e) {
      throw new DebuggerError("Invalid command", e.message);
    }
  }

  unmarshallScopesArguments(requestID: number, frameIdString: string): ScopesArguments {
    let frameId = parseInt(frameIdString, 10);
    invariant(!isNaN(frameId));
    let result: ScopesArguments = {
      kind: "scopes",
      frameId: frameId,
    };
    return result;
  }

  unmarshallVariablesArguments(requestID: number, varRefString: string): VariablesArguments {
    let varRef = parseInt(varRefString, 10);
    invariant(!isNaN(varRef));
    let result: VariablesArguments = {
      kind: "variables",
      variablesReference: varRef,
    };
    return result;
  }

  unmarshallStackframesResponse(requestID: number, responseBody: string): DebuggerResponse {
    try {
      let frames = JSON.parse(responseBody);
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
      let dbgResponse: DebuggerResponse = {
        id: requestID,
        result: result,
      };
      return dbgResponse;
    } catch (e) {
      throw new DebuggerError("Invalid response", e.message);
    }
  }

  unmarshallScopesResponse(requestID: number, responseBody: string): DebuggerResponse {
    try {
      let scopes = JSON.parse(responseBody);
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
      let dbgResponse: DebuggerResponse = {
        id: requestID,
        result: result,
      };
      return dbgResponse;
    } catch (e) {
      throw new DebuggerError("Invalid response", e.message);
    }
  }

  unmarshallVariablesResponse(requestID: number, responseBody: string): DebuggerResponse {
    try {
      let variables = JSON.parse(responseBody);
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
      let dbgResponse: DebuggerResponse = {
        id: requestID,
        result: result,
      };
      return dbgResponse;
      } catch (e) {
      throw new DebuggerError("Invalid response", e.message);
      }
    }

  unmarshallBreakpointsAddResponse(requestID: number, breakpointsString: string): DebuggerResponse {
    try {
      let breakpoints = JSON.parse(breakpointsString);
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
      let dbgResponse: DebuggerResponse = {
        id: requestID,
        result: result,
      };
      return dbgResponse;
    } catch (e) {
      throw new DebuggerError("Invalid response", e.message);
    }
  }

  unmarshallBreakpointStoppedResponse(requestID: number, parts: Array<string>): DebuggerResponse {
    invariant(parts.length === 3, "Incorrect number of arguments in breakpoint stopped response");
    let filePath = parts[0];
    let line = parseInt(parts[1], 10);
    invariant(!isNaN(line), "Invalid line number");
    let column = parseInt(parts[2], 10);
    invariant(!isNaN(column), "Invalid column number");
    let result: BreakpointStoppedResult = {
      kind: "breakpoint-stopped",
      filePath: filePath,
      line: line,
      column: column,
    };
    let dbgResponse: DebuggerResponse = {
      id: requestID,
      result: result,
    };
    return dbgResponse;
  }

  unmarshallReadyResponse(requestID: number): DebuggerResponse {
    let result: ReadyResult = {
      kind: "ready",
    };
    let dbgResponse: DebuggerResponse = {
      id: requestID,
      result: result,
    };
    return dbgResponse;
  }
}
