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
      this._addBreakpoint(bp);
    }
  }

  _addBreakpoint(bp: BreakpointType) {
    if (!(bp.filePath in this._breakpointMaps)) {
      this._breakpointMaps[bp.filePath] = new PerFileBreakpointMap(bp.filePath);
    }
    let breakpointMap = this._breakpointMaps[bp.filePath];
    breakpointMap.addBreakpoint(bp.line, bp.column);
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
      this._removeBreakpoint(bp);
    }
  }

  _removeBreakpoint(bp: BreakpointType) {
    if (bp.filePath in this._breakpointMaps) {
      this._breakpointMaps[bp.filePath].removeBreakpoint(bp.line, bp.column);
    }
  }

  enableBreakpointMulti(breakpoints: Array<BreakpointType>) {
    for (let bp of breakpoints) {
      this._enableBreakpoint(bp);
    }
  }

  _enableBreakpoint(bp: BreakpointType) {
    if (bp.filePath in this._breakpointMaps) {
      this._breakpointMaps[bp.filePath].enableBreakpoint(bp.line, bp.column);
    }
  }

  disableBreakpointMulti(breakpoints: Array<BreakpointType>) {
    for (let bp of breakpoints) {
      this._disableBreakpoint(bp);
    }
  }

  _disableBreakpoint(bp: BreakpointType) {
    if (bp.filePath in this._breakpointMaps) {
      this._breakpointMaps[bp.filePath].disableBreakpoint(bp.line, bp.column);
    }
  }
}
