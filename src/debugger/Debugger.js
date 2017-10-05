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
  constructor(channel: DebugChannel) {
    this.breakpoints = new Map();
    this.prevBreakLine = 0;
    this.prevBreakCol = 0;
    this.channel = channel;
    this.waitForRun(1000, function(line) {
      return line === "Run";
    });
  }
  breakpoints: { [number]: Breakpoint };
  prevBreakLine: number;
  prevBreakCol: number;
  channel: DebugChannel;

  /* Block until adapter says to run
  /* threshold: # of milliseconds before polling the input again
  /* runCondition: a function that determines whether the adapter has told
  /* Prepack to continue running
  */
  waitForRun(threshold: number, runCondition: string => boolean) {
    let lastPoll = Date.now();
    let blocking = true;
    let line = "";
    while (blocking) {
      if (Date.now() - lastPoll > threshold) {
        line = this.channel.readIn().toString();

        if (runCondition(line)) {
          //The adapter gave the command to continue running
          //The caller (or someone else later) needs to send a response
          //to the adapter
          //We cannot pass in the response too because it may not be ready
          //immediately after Prepack unblocks
          blocking = false;
        } else {
          //The adapter gave another command so Prepack still blocks
          //but can read in other commands and respond to them
          this.parseCommand(line);
        }
        lastPoll = Date.now();
      }
    }
  }

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
      this.waitForRun(1000, function(line) {
        return line === "proceed " + lineNum;
      });
    }
  }

  sendDebugInfo(ast: BabelNode, lineNum: number) {
    this.channel.writeOut("breakpoint stopped " + lineNum);
  }

  parseCommand(command: string) {
    if (command.length === 0) {
      return;
    }
    let parts = command.split(" ");
    if (parts[0] === "breakpoint") {
      this.parseBreakpointCommand(parts);
    }
  }

  parseBreakpointCommand(parts: Array<string>) {
    if (parts[1] === "add") {
      let lineNum = parseInt(parts[2], 10);
      let breakpoint = new Breakpoint(lineNum, true);
      this.breakpoints[lineNum] = breakpoint;
      this.channel.writeOut("added breakpoint " + lineNum);
    } else if (parts[1] === "remove") {
      let lineNum = parseInt(parts[2], 10);
      invariant(lineNum in this.breakpoints);
      delete this.breakpoints[lineNum];
      this.channel.writeOut("removed breakpoint " + lineNum);
    } else if (parts[1] === "enable") {
      let lineNum = parseInt(parts[2], 10);
      invariant(lineNum in this.breakpoints && !this.breakpoints[lineNum].enabled);
      this.breakpoints[lineNum].enabled = true;
      this.channel.writeOut("enabled breakpoint " + lineNum);
    } else if (parts[1] === "disable") {
      let lineNum = parseInt(parts[2], 10);
      invariant(lineNum in this.breakpoints && this.breakpoints[lineNum].enabled);
      this.breakpoints[lineNum].enabled = false;
      this.channel.writeOut("disabled breakpoint " + lineNum);
    }
  }

  shutdown() {
    //let the adapter know Prepack is done running
    this.channel.writeOut("Finished");
  }
}
