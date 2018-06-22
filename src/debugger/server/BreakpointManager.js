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
import { BabelNode } from "babel-types";
// import { IsStatement } from "./../../methods/is.js";

// Storing BreakpointStores for all source files
export class BreakpointManager {
  constructor() {
    this._breakpointMaps = new Map();
  }
  _breakpointMaps: Map<string, PerFileBreakpointMap>;

  getStoppableBreakpoint(ast: BabelNode): void | Breakpoint {
    // if (!IsStatement(ast)) return;
    if (ast.loc && ast.loc.source) {
      let location = ast.loc;
      // if (location.source.includes("InitializeCore.js"))
      //   console.log(`Checking ${location.source}: ${location.start.line} ${location.start.column}`);
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
      console.log(`Found bp: ${filePath}: ${lineNum}:${colNum}`);
      return breakpoint;
    }
    return null;
  }

  addBreakpointMulti(breakpoints: Array<BreakpointType>) {
    this._doBreakpointsAction(breakpoints, this._addBreakpoint.bind(this));
  }

  _addBreakpoint(bp: BreakpointType) {
    console.log(`Adding BP: ${bp.filePath}: ${bp.line}`);
    let breakpointMap = this._breakpointMaps.get(bp.filePath);
    if (!breakpointMap) {
      breakpointMap = new PerFileBreakpointMap(bp.filePath);
      this._breakpointMaps.set(bp.filePath, breakpointMap);
    }
    // We don't support column debugging, so set every breakpoint
    // to column 0 for consistency.
    breakpointMap.addBreakpoint(bp.line, 0);
  }

  getBreakpoint(filePath: string, lineNum: number, columnNum: number = 0): void | Breakpoint {
    let breakpointMap = this._breakpointMaps.get(filePath);
    if (breakpointMap) {
      console.log(`Looking for ${filePath}: ${lineNum}, ${columnNum}`);
      return breakpointMap.getBreakpoint(lineNum, columnNum);
    }
    return undefined;
  }

  removeBreakpointMulti(breakpoints: Array<BreakpointType>) {
    this._doBreakpointsAction(breakpoints, this._removeBreakpoint.bind(this));
  }

  _removeBreakpoint(bp: BreakpointType) {
    let breakpointMap = this._breakpointMaps.get(bp.filePath);
    if (breakpointMap) breakpointMap.removeBreakpoint(bp.line, bp.column);
  }

  enableBreakpointMulti(breakpoints: Array<BreakpointType>) {
    this._doBreakpointsAction(breakpoints, this._enableBreakpoint.bind(this));
  }

  _enableBreakpoint(bp: BreakpointType) {
    let breakpointMap = this._breakpointMaps.get(bp.filePath);
    if (breakpointMap) breakpointMap.enableBreakpoint(bp.line, bp.column);
  }

  disableBreakpointMulti(breakpoints: Array<BreakpointType>) {
    this._doBreakpointsAction(breakpoints, this._disableBreakpoint.bind(this));
  }

  _disableBreakpoint(bp: BreakpointType) {
    let breakpointMap = this._breakpointMaps.get(bp.filePath);
    if (breakpointMap) breakpointMap.disableBreakpoint(bp.line, bp.column);
  }

  _doBreakpointsAction(breakpoints: Array<BreakpointType>, action: BreakpointType => void) {
    for (let bp of breakpoints) {
      action(bp);
    }
  }
}
