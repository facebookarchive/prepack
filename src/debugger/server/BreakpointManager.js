/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import { PerFileBreakpointMap } from "./PerFileBreakpointMap.js";
import { Breakpoint } from "./Breakpoint.js";
import type { Breakpoint as BreakpointType } from "./../common/types.js";
import { BabelNode } from "@babel/types";

// Storing BreakpointStores for all source files
export class BreakpointManager {
  constructor() {
    this._breakpointMaps = new Map();
  }
  _breakpointMaps: Map<string, PerFileBreakpointMap>;

  getStoppableBreakpoint(ast: BabelNode): void | Breakpoint {
    if (ast.loc && ast.loc.source !== null) {
      let location = ast.loc;
      let filePath = location.source;
      if (filePath === null) return;
      let lineNum = location.start.line;
      let colNum = location.start.column;
      // Check whether there is a breakpoint we need to stop on here
      let breakpoint = this._findStoppableBreakpoint(filePath, lineNum, colNum);
      if (breakpoint === null) return;
      return breakpoint;
    }
  }

  // Try to find a breakpoint at the given location and check if we should stop on it
  _findStoppableBreakpoint(filePath: string, lineNum: number, colNum: number): null | Breakpoint {
    let breakpoint = this.getBreakpoint(filePath, lineNum, colNum);
    if (breakpoint && breakpoint.enabled) {
      return breakpoint;
    }
    return null;
  }

  addBreakpointMulti(breakpoints: Array<BreakpointType>): void {
    this._doBreakpointsAction(breakpoints, this._addBreakpoint.bind(this));
  }

  _addBreakpoint(bp: BreakpointType): void {
    let breakpointMap = this._breakpointMaps.get(bp.filePath);
    if (!breakpointMap) {
      breakpointMap = new PerFileBreakpointMap(bp.filePath);
      this._breakpointMaps.set(bp.filePath, breakpointMap);
    }
    // Nuclide doesn't support column debugging, so set every breakpoint
    // to column 0 for consistency.
    breakpointMap.addBreakpoint(bp.line, 0);
  }

  getBreakpoint(filePath: string, lineNum: number, columnNum: number = 0): void | Breakpoint {
    let breakpointMap = this._breakpointMaps.get(filePath);
    if (breakpointMap) return breakpointMap.getBreakpoint(lineNum, columnNum);
    return undefined;
  }

  removeBreakpointMulti(breakpoints: Array<BreakpointType>): void {
    this._doBreakpointsAction(breakpoints, this._removeBreakpoint.bind(this));
  }

  _removeBreakpoint(bp: BreakpointType): void {
    let breakpointMap = this._breakpointMaps.get(bp.filePath);
    if (breakpointMap) breakpointMap.removeBreakpoint(bp.line, bp.column);
  }

  enableBreakpointMulti(breakpoints: Array<BreakpointType>): void {
    this._doBreakpointsAction(breakpoints, this._enableBreakpoint.bind(this));
  }

  _enableBreakpoint(bp: BreakpointType): void {
    let breakpointMap = this._breakpointMaps.get(bp.filePath);
    if (breakpointMap) breakpointMap.enableBreakpoint(bp.line, bp.column);
  }

  disableBreakpointMulti(breakpoints: Array<BreakpointType>): void {
    this._doBreakpointsAction(breakpoints, this._disableBreakpoint.bind(this));
  }

  _disableBreakpoint(bp: BreakpointType): void {
    let breakpointMap = this._breakpointMaps.get(bp.filePath);
    if (breakpointMap) breakpointMap.disableBreakpoint(bp.line, bp.column);
  }

  _doBreakpointsAction(breakpoints: Array<BreakpointType>, action: BreakpointType => void): void {
    for (let bp of breakpoints) {
      action(bp);
    }
  }
}
