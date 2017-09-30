/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { BabelNode } from "babel-types";
import { Breakpoint } from "./Breakpoint.js";
import invariant from "../invariant.js";
import { DebugChannel } from "../DebugChannel.js";

export class Debugger {
  constructor(dbgFileLines: Array<string>, channel: DebugChannel) {
    this.breakpoints = new Map();
    this.prevBreakLine = 0;
    this.prevBreakCol = 0;
    this.parseCommands(dbgFileLines);
    this.channel = channel;
  }
  breakpoints: { [number]: Breakpoint };
  prevBreakLine: number;
  prevBreakCol: number;
  channel: DebugChannel;

  checkForActions(ast: BabelNode) {
    this.checkForBreakpoint(ast);
  }

  proceedBreakpoint(lineNum: number, colNum: number): boolean {
    if (lineNum in this.breakpoints && this.breakpoints[lineNum].enabled) {
      if (lineNum === this.prevBreakLine) {
        if (colNum === this.prevBreakCol) {
          this.prevBreakCol = 0;
        } else {
          this.prevBreakCol = colNum;
        }
        return false;
      }
      this.prevBreakLine = lineNum;
      return true;
    }
    return false;
  }

  checkForBreakpoint(ast: BabelNode) {
    invariant(ast.loc);
    let location = ast.loc;
    if (location.start.line === location.end.line) {
      let lineNum = location.start.line;
      let colNum = location.start.column;
      if (!this.proceedBreakpoint(lineNum, colNum)) return;

      console.log("Stopped for breakpoint on line " + lineNum);
      this.sendDebugInfo(ast, lineNum);

      let lastPoll = Date.now();
      let blocking = true;
      let contents = "";
      while (blocking) {
        if (Date.now() - lastPoll > 1000) {
          contents = this.channel.readIn().toString().split("\n");
          if (contents[0] === "proceed " + lineNum) {
            blocking = false;
          } else {
            this.parseCommands(contents);
          }
          lastPoll = Date.now();
        }
      }
      this.channel.writeOut("");
    }
  }

  sendDebugInfo(ast: BabelNode, lineNum: number) {
    this.channel.writeOut("breakpoint " + lineNum);
  }

  parseCommands(commands: Array<string>) {
    for (let i = 0; i < commands.length; i++) {
      let com = commands[i];
      if (com.length === 0) {
        return;
      }
      let parts = com.split(" ");
      if (parts[0] === "breakpoint") {
        this.parseBreakpointCommand(parts);
      }
    }
  }

  parseBreakpointCommand(parts: Array<string>) {
    if (parts[1] === "add") {
      let lineNum = parseInt(parts[2], 10);
      let breakpoint = new Breakpoint(lineNum, true);
      this.breakpoints[lineNum] = breakpoint;
    } else if (parts[1] === "remove") {
      let lineNum = parseInt(parts[2], 10);
      invariant(lineNum in this.breakpoints);
      delete this.breakpoints[lineNum];
    } else if (parts[1] === "enable") {
      let lineNum = parseInt(parts[2], 10);
      invariant(lineNum in this.breakpoints && !this.breakpoints[lineNum].enabled);
      this.breakpoints[lineNum].enabled = true;
    } else if (parts[1] === "disable") {
      let lineNum = parseInt(parts[2], 10);
      invariant(lineNum in this.breakpoints && this.breakpoints[lineNum].enabled);
      this.breakpoints[lineNum].enabled = false;
    }
  }
}
