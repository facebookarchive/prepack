/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { PerFileBreakpointMap } from "./PerFileBreakpointMap.js";
import { Breakpoint } from "./Breakpoint.js";
import type { Breakpoint as BreakpointType } from "./types.js";

// Storing BreakpointStores for all source files
export class BreakpointManager {
  constructor() {
    this._breakpointMaps = new Map();
  }
  _breakpointMaps: { [string]: PerFileBreakpointMap };

  addBreakpointMulti(breakpoints: Array<BreakpointType>) {
    for (let bp of breakpoints) {
      this._addBreakpoint(bp.filePath, bp.line, bp.column);
    }
  }

  _addBreakpoint(filePath: string, lineNum: number, columnNum: number = 0) {
    if (!(filePath in this._breakpointMaps)) {
      this._breakpointMaps[filePath] = new PerFileBreakpointMap(filePath);
    }
    let breakpointMap = this._breakpointMaps[filePath];
    breakpointMap.addBreakpoint(lineNum, columnNum);
  }

  getBreakpoint(filePath: string, lineNum: number, columnNum: number = 0): void | Breakpoint {
    if (filePath in this._breakpointMaps) {
      let breakpointMap = this._breakpointMaps[filePath];
      return breakpointMap.getBreakpoint(lineNum, columnNum);
    }
    return undefined;
  }

  removeBreakpointMulti(breakpoints: Array<BreakpointType>) {
    for (let bp of breakpoints) {
      this._removeBreakpoint(bp.filePath, bp.line, bp.column);
    }
  }

  _removeBreakpoint(filePath: string, lineNum: number, columnNum: number = 0) {
    if (filePath in this._breakpointMaps) {
      this._breakpointMaps[filePath].removeBreakpoint(lineNum, columnNum);
    }
  }

  enableBreakpointMulti(breakpoints: Array<BreakpointType>) {
    for (let bp of breakpoints) {
      this._enableBreakpoint(bp.filePath, bp.line, bp.column);
    }
  }

  _enableBreakpoint(filePath: string, lineNum: number, columnNum: number = 0) {
    if (filePath in this._breakpointMaps) {
      this._breakpointMaps[filePath].enableBreakpoint(lineNum, columnNum);
    }
  }

  disableBreakpointMulti(breakpoints: Array<BreakpointType>) {
    for (let bp of breakpoints) {
      this._disableBreakpoint(bp.filePath, bp.line, bp.column);
    }
  }

  _disableBreakpoint(filePath: string, lineNum: number, columnNum: number = 0) {
    if (filePath in this._breakpointMaps) {
      this._breakpointMaps[filePath].disableBreakpoint(lineNum, columnNum);
    }
  }
}
