/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict */

import { Breakpoint } from "./Breakpoint.js";

// Storage for all the breakpoints in one source file
// Each source file will be associated with one PerFileBreakpointMap
export class PerFileBreakpointMap {
  constructor(filePath: string) {
    this._filePath = filePath;
    this._breakpoints = new Map();
  }
  _filePath: string;

  //map of line:column to Breakpoint objects
  _breakpoints: Map<string, Breakpoint>;

  addBreakpoint(line: number, column: number = 0, temporary?: boolean, enabled?: boolean): void {
    let breakpoint = new Breakpoint(this._filePath, line, column, temporary, enabled);
    let key = this._getKey(line, column);
    this._breakpoints.set(key, breakpoint);
  }

  getBreakpoint(line: number, column: number = 0): void | Breakpoint {
    //check for a column breakpoint first, then line breakpoint
    if (column !== 0) {
      let key = this._getKey(line, column);
      if (this._breakpoints.has(key)) {
        return this._breakpoints.get(key);
      } else {
        key = this._getKey(line, 0);
        if (this._breakpoints.has(key)) {
          return this._breakpoints.get(key);
        }
      }
    } else {
      let key = this._getKey(line, 0);
      if (this._breakpoints.has(key)) {
        return this._breakpoints.get(key);
      }
    }

    return undefined;
  }

  removeBreakpoint(line: number, column: number = 0): void {
    let key = this._getKey(line, column);
    if (this._breakpoints.has(key)) {
      this._breakpoints.delete(key);
    }
  }

  enableBreakpoint(line: number, column: number = 0): void {
    let key = this._getKey(line, column);
    let breakpoint = this._breakpoints.get(key);
    if (breakpoint) breakpoint.enabled = true;
  }

  disableBreakpoint(line: number, column: number = 0): void {
    let key = this._getKey(line, column);
    let breakpoint = this._breakpoints.get(key);
    if (breakpoint) breakpoint.enabled = false;
  }

  _getKey(line: number, column: number): string {
    return `${line}:${column}`;
  }
}
