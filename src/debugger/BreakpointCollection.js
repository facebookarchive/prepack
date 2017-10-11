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

// Storing BreakpointStores for all source files
export class BreakpointCollection {
  constructor() {
    this.breakpointMaps = new Map();
  }
  breakpointMaps: { [string]: PerFileBreakpointMap };

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

  removeBreakpoint(filePath: string, lineNum: number, columnNum: number = 0) {
    if (filePath in this.breakpointMaps) {
      this.breakpointMaps[filePath].removeBreakpoint(lineNum, columnNum);
    }
  }

  enableBreakpoint(filePath: string, lineNum: number, columnNum: number = 0) {
    if (filePath in this.breakpointMaps) {
      this.breakpointMaps[filePath].enableBreakpoint(lineNum, columnNum);
    }
  }

  disableBreakpoint(filePath: string, lineNum: number, columnNum: number = 0) {
    if (filePath in this.breakpointMaps) {
      this.breakpointMaps[filePath].disableBreakpoint(lineNum, columnNum);
    }
  }
}
