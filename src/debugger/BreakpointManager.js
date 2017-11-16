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
import type { Breakpoint  as BreakpointType } from "./types.js";

// Storing BreakpointStores for all source files
export class BreakpointManager {
  constructor() {
    this.breakpointMaps = new Map();
  }
  breakpointMaps: { [string]: PerFileBreakpointMap };

  addBreakpointMulti(breakpoints: Array<BreakpointType>) {
    for (let bp of breakpoints) {
      this.addBreakpoint(bp.filePath, bp.line, bp.column);
    }
  }

  addBreakpoint(filePath: string, lineNum: number, columnNum: number = 0) {
    if (!(filePath in this.breakpointMaps)) {
      this.breakpointMaps[filePath] = new PerFileBreakpointMap(filePath);
    }
    let breakpointMap = this.breakpointMaps[filePath];
    breakpointMap.addBreakpoint(lineNum, columnNum);
  }

  getBreakpoint(filePath: string, lineNum: number, columnNum: number = 0): void | Breakpoint {
    if (filePath in this.breakpointMaps) {
      let breakpointMap = this.breakpointMaps[filePath];
      return breakpointMap.getBreakpoint(lineNum, columnNum);
    }
    return undefined;
  }

  removeBreakpointMulti(breakpoints: Array<BreakpointType>) {
    for (let bp of breakpoints) {
      this.removeBreakpoint(bp.filePath, bp.line, bp.column);
    }
  }

  removeBreakpoint(filePath: string, lineNum: number, columnNum: number = 0) {
    if (filePath in this.breakpointMaps) {
      this.breakpointMaps[filePath].removeBreakpoint(lineNum, columnNum);
    }
  }

  enableBreakpointMulti(breakpoints: Array<BreakpointType>) {
    for (let bp of breakpoints) {
      this.enableBreakpoint(bp.filePath, bp.line, bp.column);
    }
  }

  enableBreakpoint(filePath: string, lineNum: number, columnNum: number = 0) {
    if (filePath in this.breakpointMaps) {
      this.breakpointMaps[filePath].enableBreakpoint(lineNum, columnNum);
    }
  }

  disableBreakpointMulti(breakpoints: Array<BreakpointType>) {
    for (let bp of breakpoints) {
      this.disableBreakpoint(bp.filePath, bp.line, bp.column);
    }
  }

  disableBreakpoint(filePath: string, lineNum: number, columnNum: number = 0) {
    if (filePath in this.breakpointMaps) {
      this.breakpointMaps[filePath].disableBreakpoint(lineNum, columnNum);
    }
  }
}
