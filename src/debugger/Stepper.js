/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */
import type { StoppedData } from "./types.js";
import { IsStatement } from "./../methods/is.js";
import { BabelNode } from "babel-types";

export class StepInto {
  constructor(filePath: string, line: number, column: number) {
    this._prevStopData = {
      filePath: filePath,
      line: line,
      column: column,
    };
  }
  _prevStopData: StoppedData;

  isComplete(ast: BabelNode): boolean {
    // we should only step to statements
    if (!IsStatement(ast)) return false;
    let loc = ast.loc;
    if (!loc) return false;
    let filePath = loc.source;
    let line = loc.start.line;
    let column = loc.start.column;
    if (!filePath) return false;
    if (this._prevStopData) {
      if (
        filePath === this._prevStopData.filePath &&
        line === this._prevStopData.line &&
        column === this._prevStopData.column
      ) {
        return false;
      }
    } else {
      return false;
    }
    return true;
  }
}
