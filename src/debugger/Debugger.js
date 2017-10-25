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
import { BreakpointCollection } from "./BreakpointCollection.js";
import { Breakpoint } from "./Breakpoint.js";
import type { BreakpointCommandArguments } from "./types.js";
import invariant from "../invariant.js";
import { DebugChannel } from "./channel/DebugChannel.js";
import { DebugMessage } from "./channel/DebugMessage.js";
import { DebuggerError } from "./DebuggerError.js";

export class DebugServer {
  constructor(channel: DebugChannel) {
    this.breakpoints = new BreakpointCollection();
    this.previousExecutedLine = 0;
    this.previousExecutedCol = 0;
    this.channel = channel;
    this.waitForRun();
  }
  // the collection of breakpoints
  breakpoints: BreakpointCollection;
  previousExecutedFile: void | string;
  previousExecutedLine: number;
  previousExecutedCol: number;
  // the channel to communicate with the adapter
  channel: DebugChannel;

  /* Block until adapter says to run
  /* runCondition: a function that determines whether the adapter has told
  /* Prepack to continue running
  */
  waitForRun() {
    let keepRunning = false;
    let message = "";
    while (!keepRunning) {
      message = this.channel.readIn().toString();
      keepRunning = this.processDebuggerCommand(message);
    }
  }

  // Checking if the debugger needs to take any action on reaching this ast node
  checkForActions(ast: BabelNode) {
    this.checkForBreakpoint(ast);
    // last step: set the current location as the previously executed line
    if (ast.loc && ast.loc.source !== null) {
      this.previousExecutedFile = ast.loc.source;
      this.previousExecutedLine = ast.loc.start.line;
      this.previousExecutedCol = ast.loc.start.column;
    }
  }

  // Try to find a breakpoint at the given location and check if we should stop on it
  findStoppableBreakpoint(filePath: string, lineNum: number, colNum: number): null | Breakpoint {
    let breakpoint = this.breakpoints.getBreakpoint(filePath, lineNum, colNum);
    if (breakpoint && breakpoint.enabled) {
      // checking if this is the same file and line we stopped at last time
      // if so, we should skip it this time
      // Note: for the case when the debugger is supposed to stop on the same
      // breakpoint consecutively (e.g. the statement is in a loop), some other
      // ast node (e.g. block, loop) must have been checked in between so
      // previousExecutedFile and previousExecutedLine will have changed
      if (breakpoint.column !== 0) {
        // this is a column breakpoint
        if (
          filePath === this.previousExecutedFile &&
          lineNum === this.previousExecutedLine &&
          colNum === this.previousExecutedCol
        ) {
          return null;
        }
      } else {
        // this is a line breakpoint
        if (filePath === this.previousExecutedFile && lineNum === this.previousExecutedLine) {
          return null;
        }
      }
      return breakpoint;
    }
    return null;
  }

  checkForBreakpoint(ast: BabelNode) {
    if (ast.loc && ast.loc.source) {
      let location = ast.loc;
      let filePath = location.source;
      if (filePath === null) return;
      let lineNum = location.start.line;
      let colNum = location.start.column;
      // Check whether there is a breakpoint we need to stop on here
      let breakpoint = this.findStoppableBreakpoint(filePath, lineNum, colNum);
      if (breakpoint === null) return;
      // Tell the adapter that Prepack has stopped on this breakpoint
      this.channel.writeOut(
        `${DebugMessage.BREAKPOINT} ${DebugMessage.BREAKPOINT_STOPPED} ${breakpoint.filePath} ${breakpoint.line}:${breakpoint.column}`
      );

      // Wait for the adapter to tell us to run again
      this.waitForRun();
    }
  }

  // Process a command from a debugger. Returns whether Prepack should unblock
  // if it is blocked
  processDebuggerCommand(command: string) {
    if (command.length === 0) {
      return;
    }
    let parts = command.split(" ");
    let prefix = parts[0];
    switch (prefix) {
      case DebugMessage.BREAKPOINT:
        this.executeBreakpointCommand(this._parseBreakpointArguments(parts));
        break;
      case DebugMessage.PREPACK_RUN:
        return true;
      default:
        throw new DebuggerError("Invalid command", "Invalid command from adapter: " + prefix);
    }
    return false;
  }

  executeBreakpointCommand(args: BreakpointCommandArguments) {
    if (args.kind === DebugMessage.BREAKPOINT_ADD) {
      this.breakpoints.addBreakpoint(args.filePath, args.lineNum, args.columnNum);
      this.channel.writeOut(
        `${DebugMessage.BREAKPOINT} ${DebugMessage.BREAKPOINT_ADD} ${args.filePath} ${args.lineNum} ${args.columnNum}`
      );
    } else if (args.kind === DebugMessage.BREAKPOINT_REMOVE) {
      this.breakpoints.removeBreakpoint(args.filePath, args.lineNum, args.columnNum);
      this.channel.writeOut(
        `${DebugMessage.BREAKPOINT} ${DebugMessage.BREAKPOINT_REMOVE} ${args.filePath} ${args.lineNum} ${args.columnNum}`
      );
    } else if (args.kind === DebugMessage.BREAKPOINT_ENABLE) {
      this.breakpoints.enableBreakpoint(args.filePath, args.lineNum, args.columnNum);
      this.channel.writeOut(
        `${DebugMessage.BREAKPOINT} ${DebugMessage.BREAKPOINT_ENABLE} ${args.filePath} ${args.lineNum} ${args.columnNum}`
      );
    } else if (args.kind === DebugMessage.BREAKPOINT_DISABLE) {
      this.breakpoints.disableBreakpoint(args.filePath, args.lineNum, args.columnNum);
      this.channel.writeOut(
        `${DebugMessage.BREAKPOINT} ${DebugMessage.BREAKPOINT_DISABLE} ${args.filePath} ${args.lineNum} ${args.columnNum}`
      );
    }
  }

  _parseBreakpointArguments(parts: Array<string>): BreakpointCommandArguments {
    invariant(parts[0] === DebugMessage.BREAKPOINT);
    let kind = parts[1];
    let filePath = parts[2];

    let lineNum = parseInt(parts[3], 10);
    invariant(!isNaN(lineNum));
    let columnNum = 0;
    if (parts.length === 5) {
      columnNum = parseInt(parts[4], 10);
      invariant(!isNaN(columnNum));
    }

    let result: BreakpointCommandArguments = {
      kind: kind,
      filePath: filePath,
      lineNum: lineNum,
      columnNum: columnNum,
    };

    return result;
  }

  shutdown() {
    //let the adapter know Prepack is done running
    this.channel.writeOut(DebugMessage.PREPACK_FINISH);
  }
}
