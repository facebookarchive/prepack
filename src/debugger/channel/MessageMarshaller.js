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
  BreakpointArguments,
  Stackframe,
  DebuggerResponse,
  StackframeResult,
  BreakpointAddResult,
  BreakpointStoppedResult,
  ReadyResult,
} from "./../types.js";
import invariant from "./../../invariant.js";
import { DebuggerError } from "./../DebuggerError.js";

export class MessageMarshaller {
  marshallBreakpointAcknowledge(
    requestID: number,
    prefix: string,
    filePath: string,
    line: number,
    column: number
  ): string {
    return `${requestID} ${prefix} ${filePath} ${line} ${column}`;
  }

  marshallBreakpointStopped(requestID: number, args: BreakpointArguments): string {
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

  marshallSetBreakpointsRequest(requestID: number, args: BreakpointArguments): string {
    return `${requestID} ${DebugMessage.BREAKPOINT_ADD_COMMAND} ${args.filePath} ${args.line} ${args.column}`;
  }

  marshallStackFramesRequest(requestID: number): string {
    return `${requestID} ${DebugMessage.STACKFRAMES_COMMAND}`;
  }

  marshallStackFramesResponse(requestID: number, stackframes: Array<Stackframe>) {
    return `${requestID} ${DebugMessage.STACKFRAMES_RESPONSE} ${JSON.stringify(stackframes)}`;
  }

  unmarshallBreakpointArguments(requestID: number, parts: Array<string>): BreakpointArguments {
    let filePath = parts[0];

    let lineNum = parseInt(parts[1], 10);
    invariant(!isNaN(lineNum));
    let columnNum = 0;
    if (parts.length === 3) {
      columnNum = parseInt(parts[2], 10);
      invariant(!isNaN(columnNum));
    }

    let result: BreakpointArguments = {
      kind: "breakpoint",
      filePath: filePath,
      line: lineNum,
      column: columnNum,
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

  unmarshallBreakpointAddResponse(requestID: number): DebuggerResponse {
    let result: BreakpointAddResult = {
      kind: "breakpoint-add",
    };
    let dbgResponse: DebuggerResponse = {
      id: requestID,
      result: result,
    };
    return dbgResponse;
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
