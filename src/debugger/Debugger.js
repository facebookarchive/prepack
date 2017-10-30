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
    let message = "";
    while (!keepRunning) {
      message = this._channel.readIn().toString();
      keepRunning = this.processDebuggerCommand(message);
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
      this._channel.sendBreakpointStopped(
        this._lastRunRequestID,
        breakpoint.filePath,
        breakpoint.line,
        breakpoint.column
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
    // unique ID for each request
    let requestID = parseInt(parts[0], 10);
    invariant(!isNaN(requestID), "Request ID must be a number");

    let prefix = parts[1];
    switch (prefix) {
      case DebugMessage.BREAKPOINT_ADD_COMMAND:
        let addArgs = this._messageParser.parseBreakpointArguments(parts.slice(1));
        this._breakpoints.addBreakpoint(addArgs.filePath, addArgs.lineNum, addArgs.columnNum);
        this._channel.sendBreakpointAcknowledge(
          requestID,
          DebugMessage.BREAKPOINT_ADD_ACKNOWLEDGE,
          addArgs.filePath,
          addArgs.lineNum,
          addArgs.columnNum
        );
        break;
      case DebugMessage.BREAKPOINT_REMOVE_COMMAND:
        let removeArgs = this._messageParser.parseBreakpointArguments(parts.slice(1));
        this._breakpoints.removeBreakpoint(removeArgs.filePath, removeArgs.lineNum, removeArgs.columnNum);
        this._channel.sendBreakpointAcknowledge(
          requestID,
          DebugMessage.BREAKPOINT_REMOVE_ACKNOWLEDGE,
          removeArgs.filePath,
          removeArgs.lineNum,
          removeArgs.columnNum
        );
        break;
      case DebugMessage.BREAKPOINT_ENABLE_COMMAND:
        let enableArgs = this._messageParser.parseBreakpointArguments(parts.slice(1));
        this._breakpoints.enableBreakpoint(enableArgs.filePath, enableArgs.lineNum, enableArgs.columnNum);
        this._channel.sendBreakpointAcknowledge(
          requestID,
          DebugMessage.BREAKPOINT_ENABLE_ACKNOWLEDGE,
          enableArgs.filePath,
          enableArgs.lineNum,
          enableArgs.columnNum
        );
        break;
      case DebugMessage.BREAKPOINT_DISABLE_COMMAND:
        let disableArgs = this._messageParser.parseBreakpointArguments(parts.slice(1));
        this._breakpoints.disableBreakpoint(disableArgs.filePath, disableArgs.lineNum, disableArgs.columnNum);
        this._channel.sendBreakpointAcknowledge(
          requestID,
          DebugMessage.BREAKPOINT_DISABLE_ACKNOWLEDGE,
          disableArgs.filePath,
          disableArgs.lineNum,
          disableArgs.columnNum
        );
        break;
      case DebugMessage.PREPACK_RUN_COMMAND:
        this._lastRunRequestID = requestID;
        return true;
      default:
        throw new DebuggerError("Invalid command", "Invalid command from adapter: " + prefix);
    }
    return false;
  }

  shutdown() {
    //let the adapter know Prepack is done running
    this._channel.sendPrepackFinish(this._lastRunRequestID);
  }
}
