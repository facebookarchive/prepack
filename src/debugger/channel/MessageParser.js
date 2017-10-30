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
import type { BreakpointCommandArguments } from "./../types.js";

export class MessageParser {
  parseBreakpointArguments(parts: Array<string>) {
    let kind = parts[0];
    let filePath = parts[1];

    let lineNum = parseInt(parts[2], 10);
    invariant(!isNaN(lineNum));
    let columnNum = 0;
    if (parts.length === 4) {
      columnNum = parseInt(parts[3], 10);
      invariant(!isNaN(columnNum));
    }

    let result: BreakpointCommandArguments = {
      kind: kind,
      filePath: filePath,
      lineNum: lineNum,
      columnNum: columnNum,
    };

    return result;
  }
}
