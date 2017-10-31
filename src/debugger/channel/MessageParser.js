/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */
import invariant from "./../../invariant.js";
import type { BreakpointRequestArguments } from "./../types.js";

export class MessageParser {
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
