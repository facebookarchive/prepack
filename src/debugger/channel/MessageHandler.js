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
import type { BreakpointRequestArguments } from "./../types.js";
import invariant from "./../../invariant.js";

export class MessageHandler {
  formatBreakpointAcknowledge(
    requestID: number,
    prefix: string,
    filePath: string,
    line: number,
    column: number
  ): string {
    return `${requestID} ${prefix} ${filePath} ${line} ${column}`;
  }

  formatBreakpointStopped(requestID: number, filePath: string, line: number, column: number): string {
    return `${requestID} ${DebugMessage.BREAKPOINT_STOPPED_RESPONSE} ${filePath} ${line}:${column}`;
  }

  formatPrepackFinish(requestID: number) {
    return `${requestID} ${DebugMessage.PREPACK_FINISH_RESPONSE}`;
  }

  formatDebuggerStart(requestID: number) {
    return `${requestID} ${DebugMessage.DEBUGGER_ATTACHED}`;
  }

  formatContinueRequest(requestID: number) {
    return `${requestID} ${DebugMessage.PREPACK_RUN_COMMAND}`;
  }

  formatSetBreakpointsRequest(requestID: number, filePath: string, line: number, column: number) {
    return `${requestID} ${DebugMessage.BREAKPOINT_ADD_COMMAND} ${filePath} ${line} ${column}`;
  }

  parseBreakpointArguments(requestID: number, parts: Array<string>) {
    let filePath = parts[0];

    let lineNum = parseInt(parts[1], 10);
    invariant(!isNaN(lineNum));
    let columnNum = 0;
    if (parts.length === 3) {
      columnNum = parseInt(parts[2], 10);
      invariant(!isNaN(columnNum));
    }

    let result: BreakpointRequestArguments = {
      requestID: requestID,
      kind: "breakpoint",
      filePath: filePath,
      line: lineNum,
      column: columnNum,
    };
    return result;
  }
}
