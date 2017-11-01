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
import type { BreakpointArguments } from "./../types.js";
import invariant from "./../../invariant.js";

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
    return `${requestID} ${DebugMessage.BREAKPOINT_STOPPED_RESPONSE} ${args.filePath} ${args.line}:${args.column}`;
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
}
