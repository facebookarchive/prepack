/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { Breakpoint } from "./Breakpoint.js";

// Storage for all the breakpoints in one source file
// Each source file will be associated with one BreakpointStore
export class BreakpointMap {
  constructor(filePath: string) {
    this.filePath = filePath;
    this.breakpoints = new Map();
  }
  filePath: string;

  //map of line numbers to Breakpoint objects
  breakpoints: { [string]: Breakpoint };

  addBreakpoint(line: number, column: number = 0, temporary?: boolean, enabled?: boolean) {
    let breakpoint = new Breakpoint(this.filePath, line, column, temporary, enabled);
    let key = this._getKey(line, column);
    this.breakpoints[key] = breakpoint;
  }

  getBreakpoint(line: number, column: number = 0): void | Breakpoint {
    let key = this._getKey(line, column);
    if (key in this.breakpoints) {
      return this.breakpoints[key];
    }
    return undefined;
  }

  removeBreakpoint(line: number, column: number = 0) {
    let key = this._getKey(line, column);
    if (key in this.breakpoints) {
      delete this.breakpoints[key];
    }
  }

  enableBreakpoint(line: number, column: number = 0) {
    let key = this._getKey(line, column);
    if (key in this.breakpoints) {
      this.breakpoints[key].enabled = true;
    }
  }

  disableBreakpoint(line: number, column: number = 0) {
    let key = this._getKey(line, column);
    if (key in this.breakpoints) {
      this.breakpoints[key].enabled = false;
    }
  }

  _getKey(line: number, column: number): string {
    return `${line}:${column}`;
  }
}
