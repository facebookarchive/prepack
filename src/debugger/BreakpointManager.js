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
import type { Breakpoint as BreakpointType, StoppedData, StoppedReason } from "./types.js";
import { BabelNode } from "babel-types";
import { IsStatement } from "./../methods/is.js";
import type { DebugChannel } from "./channel/DebugChannel.js";

// Storing BreakpointStores for all source files
export class BreakpointManager {
  constructor(channel: DebugChannel) {
    this._channel = channel;
    this._breakpointMaps = new Map();
  }
  _breakpointMaps: Map<string, PerFileBreakpointMap>;
  _previousStop: StoppedData;
  _channel: DebugChannel;

  onDebuggeeStop(ast: BabelNode, reason: StoppedReason) {
    if (ast.loc && ast.loc.source !== null) {
      this._previousStop = {
        filePath: ast.loc.source,
        line: ast.loc.start.line,
        column: ast.loc.start.column,
      };
    }
  }

  isValidBreakpoint(ast: BabelNode): boolean {
    if (!IsStatement(ast)) return false;
    if (ast.loc && ast.loc.source) {
      let location = ast.loc;
      let filePath = location.source;
      if (filePath === null) return false;
      let lineNum = location.start.line;
      let colNum = location.start.column;
      // Check whether there is a breakpoint we need to stop on here
      let breakpoint = this._findStoppableBreakpoint(filePath, lineNum, colNum);
      if (breakpoint === null) return false;
      // Tell the adapter that Prepack has stopped on this breakpoint
      this._channel.sendStoppedResponse("Breakpoint", breakpoint.filePath, breakpoint.line, breakpoint.column);
      return true;
    }
    return false;
  }

  // Try to find a breakpoint at the given location and check if we should stop on it
  _findStoppableBreakpoint(filePath: string, lineNum: number, colNum: number): null | Breakpoint {
    let breakpoint = this.getBreakpoint(filePath, lineNum, colNum);
    if (breakpoint && breakpoint.enabled) {
      if (this._previousStop) {
        // checking if this is the same file and line we stopped at last time
        // if so, we should skip it this time
        // Note: for the case when the debugger is supposed to stop on the same
        // breakpoint consecutively (e.g. the statement is in a loop), some other
        // ast node (e.g. block, loop) must have been checked in between so
        // previousExecutedFile and previousExecutedLine will have changed
        if (breakpoint.column !== 0) {
          // this is a column breakpoint
          if (
            filePath === this._previousStop.filePath &&
            lineNum === this._previousStop.line &&
            colNum === this._previousStop.column
          ) {
            return null;
          }
        } else {
          // this is a line breakpoint
          if (filePath === this._previousStop.filePath && lineNum === this._previousStop.line) {
            return null;
          }
        }
      }
      return breakpoint;
    }
    return null;
  }

  addBreakpointMulti(breakpoints: Array<BreakpointType>) {
    this._doBreakpointsAction(breakpoints, this._addBreakpoint.bind(this));
  }

  _addBreakpoint(bp: BreakpointType) {
    let breakpointMap = this._breakpointMaps.get(bp.filePath);
    if (!breakpointMap) {
      breakpointMap = new PerFileBreakpointMap(bp.filePath);
      this._breakpointMaps.set(bp.filePath, breakpointMap);
    }
    breakpointMap.addBreakpoint(bp.line, bp.column);
  }

  getBreakpoint(filePath: string, lineNum: number, columnNum: number = 0): void | Breakpoint {
    let breakpointMap = this._breakpointMaps.get(filePath);
    if (breakpointMap) return breakpointMap.getBreakpoint(lineNum, columnNum);
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
