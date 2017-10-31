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
import invariant from "../invariant.js";
import type { DebugChannel } from "./channel/DebugChannel.js";
import { DebugMessage } from "./channel/DebugMessage.js";
import { DebuggerError } from "./DebuggerError.js";
import { MessageParser } from "./channel/MessageParser.js";
import type { DebuggerRequest } from "./types.js";

export class DebugServer {
  constructor(channel: DebugChannel) {
    this._breakpoints = new BreakpointCollection();
    this._previousExecutedLine = 0;
    this._previousExecutedCol = 0;
    this._lastRunRequestID = 0;
    this._messageParser = new MessageParser();
    this._channel = channel;
    this.waitForRun();
  }
  // the collection of breakpoints
  _breakpoints: BreakpointCollection;
  _previousExecutedFile: void | string;
  _previousExecutedLine: number;
  _previousExecutedCol: number;
  // helper to parse messages;
  _messageParser: MessageParser;
  // the channel to communicate with the adapter
  _channel: DebugChannel;
  _lastRunRequestID: number;

  /* Block until adapter says to run
  /* runCondition: a function that determines whether the adapter has told
  /* Prepack to continue running
  */
  waitForRun() {
    let keepRunning = false;
    let request;
    while (!keepRunning) {
      request = this._channel.readIn();
      keepRunning = this.processDebuggerCommand(request);
    }
  }

  // Checking if the debugger needs to take any action on reaching this ast node
  checkForActions(ast: BabelNode) {
    this.checkForBreakpoint(ast);
    // last step: set the current location as the previously executed line
    if (ast.loc && ast.loc.source !== null) {
      this._previousExecutedFile = ast.loc.source;
      this._previousExecutedLine = ast.loc.start.line;
      this._previousExecutedCol = ast.loc.start.column;
    }
  }

  // Try to find a breakpoint at the given location and check if we should stop on it
  findStoppableBreakpoint(filePath: string, lineNum: number, colNum: number): null | Breakpoint {
    let breakpoint = this._breakpoints.getBreakpoint(filePath, lineNum, colNum);
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
          filePath === this._previousExecutedFile &&
          lineNum === this._previousExecutedLine &&
          colNum === this._previousExecutedCol
        ) {
          return null;
        }
      } else {
        // this is a line breakpoint
        if (filePath === this._previousExecutedFile && lineNum === this._previousExecutedLine) {
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
      this._channel.sendBreakpointStopped(breakpoint.filePath, breakpoint.line, breakpoint.column);
      // Wait for the adapter to tell us to run again
      this.waitForRun();
    }
  }

  // Process a command from a debugger. Returns whether Prepack should unblock
  // if it is blocked
  processDebuggerCommand(request: DebuggerRequest) {
    let command = request.command;
    let args = request.arguments;
    switch (command) {
      case DebugMessage.BREAKPOINT_ADD_COMMAND:
        invariant(args.kind === "breakpoint");
        this._breakpoints.addBreakpoint(args.filePath, args.line, args.column);
        this._channel.sendBreakpointAcknowledge(DebugMessage.BREAKPOINT_ADD_ACKNOWLEDGE, args);
        break;
      case DebugMessage.BREAKPOINT_REMOVE_COMMAND:
        invariant(args.kind === "breakpoint");
        this._breakpoints.removeBreakpoint(args.filePath, args.line, args.column);
        this._channel.sendBreakpointAcknowledge(DebugMessage.BREAKPOINT_REMOVE_ACKNOWLEDGE, args);
        break;
      case DebugMessage.BREAKPOINT_ENABLE_COMMAND:
        invariant(args.kind === "breakpoint");
        this._breakpoints.enableBreakpoint(args.filePath, args.line, args.column);
        this._channel.sendBreakpointAcknowledge(DebugMessage.BREAKPOINT_ENABLE_ACKNOWLEDGE, args);
        break;
      case DebugMessage.BREAKPOINT_DISABLE_COMMAND:
        invariant(args.kind === "breakpoint");
        this._breakpoints.disableBreakpoint(args.filePath, args.line, args.column);
        this._channel.sendBreakpointAcknowledge(DebugMessage.BREAKPOINT_DISABLE_ACKNOWLEDGE, args);
        break;
      case DebugMessage.PREPACK_RUN_COMMAND:
        invariant(args.kind === "run");
        return true;
      default:
        throw new DebuggerError("Invalid command", "Invalid command from adapter: " + command);
    }
    return false;
  }

  shutdown() {
    //let the adapter know Prepack is done running
    this._channel.sendPrepackFinish();
  }
}
