/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import { BreakpointManager } from "./BreakpointManager.js";
import { BabelNode } from "@babel/types";
import type { BabelNodeSourceLocation } from "@babel/types";
import invariant from "../common/invariant.js";
import type { DebugChannel } from "./channel/DebugChannel.js";
import { DebugMessage } from "./../common/channel/DebugMessage.js";
import { DebuggerError } from "./../common/DebuggerError.js";
import type {
  DebuggerRequest,
  StackframeArguments,
  ScopesArguments,
  Stackframe,
  Scope,
  VariablesArguments,
  EvaluateArguments,
  SourceData,
} from "./../common/types.js";
import type { Realm } from "./../../realm.js";
import { ExecutionContext } from "./../../realm.js";
import { VariableManager } from "./VariableManager.js";
import { SteppingManager } from "./SteppingManager.js";
import type { StoppableObject } from "./StopEventManager.js";
import { StopEventManager } from "./StopEventManager.js";
import {
  EnvironmentRecord,
  GlobalEnvironmentRecord,
  FunctionEnvironmentRecord,
  DeclarativeEnvironmentRecord,
  ObjectEnvironmentRecord,
} from "./../../environment.js";
import { CompilerDiagnostic } from "../../errors.js";
import type { Severity } from "../../errors.js";
import { SourceMapManager } from "../../utils/SourceMapManager.js";
import type { DebuggerConfigArguments } from "../../types";

export class DebugServer {
  constructor(channel: DebugChannel, realm: Realm, configArgs: DebuggerConfigArguments) {
    this._channel = channel;
    this._realm = realm;
    this._breakpointManager = new BreakpointManager();
    this._variableManager = new VariableManager(realm);
    this._stepManager = new SteppingManager(this._realm, /* default discard old steppers */ false);
    this._stopEventManager = new StopEventManager();
    this._diagnosticSeverity = configArgs.diagnosticSeverity || "FatalError";
    this._sourceMapManager = new SourceMapManager(configArgs.buckRoot, configArgs.sourcemaps);
    this.waitForRun(undefined);
  }
  // the collection of breakpoints
  _breakpointManager: BreakpointManager;
  // the channel to communicate with the adapter
  _channel: DebugChannel;
  _realm: Realm;
  _variableManager: VariableManager;
  _stepManager: SteppingManager;
  _stopEventManager: StopEventManager;
  _lastExecuted: SourceData;
  // Severity at which debugger will break when CompilerDiagnostics are generated. Default is Fatal.
  _diagnosticSeverity: Severity;
  _sourceMapManager: SourceMapManager;

  /* Block until adapter says to run
  /* ast: the current ast node we are stopped on
  /* reason: the reason the debuggee is stopping
  */
  waitForRun(loc: void | BabelNodeSourceLocation): void {
    let keepRunning = false;
    let request;
    while (!keepRunning) {
      request = this._channel.readIn();
      keepRunning = this.processDebuggerCommand(request, loc);
    }
  }

  // Checking if the debugger needs to take any action on reaching this ast node
  checkForActions(ast: BabelNode): void {
    if (this._checkAndUpdateLastExecuted(ast)) {
      let stoppables: Array<StoppableObject> = this._stepManager.getAndDeleteCompletedSteppers(ast);
      let breakpoint = this._breakpointManager.getStoppableBreakpoint(ast);
      if (breakpoint) stoppables.push(breakpoint);
      let reason = this._stopEventManager.getDebuggeeStopReason(ast, stoppables);
      if (reason) {
        let location = ast.loc;
        invariant(location && location.source !== null);
        let absolutePath = this._sourceMapManager.relativeToAbsolute(location.source);
        this._channel.sendStoppedResponse(reason, absolutePath, location.start.line, location.start.column);
        this.waitForRun(location);
      }
    }
  }

  // Process a command from a debugger. Returns whether Prepack should unblock
  // if it is blocked
  processDebuggerCommand(request: DebuggerRequest, loc: void | BabelNodeSourceLocation): boolean {
    let requestID = request.id;
    let command = request.command;
    let args = request.arguments;
    // Convert incoming location sources to relative paths in order to match internal representation of filenames.
    if (args.kind === "breakpoint") {
      for (let bp of args.breakpoints) {
        bp.filePath = this._sourceMapManager.absoluteToRelative(bp.filePath);
      }
    }

    switch (command) {
      case DebugMessage.BREAKPOINT_ADD_COMMAND:
        invariant(args.kind === "breakpoint");
        this._breakpointManager.addBreakpointMulti(args.breakpoints);
        this._channel.sendBreakpointsAcknowledge(DebugMessage.BREAKPOINT_ADD_ACKNOWLEDGE, requestID, args);
        break;
      case DebugMessage.BREAKPOINT_REMOVE_COMMAND:
        invariant(args.kind === "breakpoint");
        this._breakpointManager.removeBreakpointMulti(args.breakpoints);
        this._channel.sendBreakpointsAcknowledge(DebugMessage.BREAKPOINT_REMOVE_ACKNOWLEDGE, requestID, args);
        break;
      case DebugMessage.BREAKPOINT_ENABLE_COMMAND:
        invariant(args.kind === "breakpoint");
        this._breakpointManager.enableBreakpointMulti(args.breakpoints);
        this._channel.sendBreakpointsAcknowledge(DebugMessage.BREAKPOINT_ENABLE_ACKNOWLEDGE, requestID, args);
        break;
      case DebugMessage.BREAKPOINT_DISABLE_COMMAND:
        invariant(args.kind === "breakpoint");
        this._breakpointManager.disableBreakpointMulti(args.breakpoints);
        this._channel.sendBreakpointsAcknowledge(DebugMessage.BREAKPOINT_DISABLE_ACKNOWLEDGE, requestID, args);
        break;
      case DebugMessage.PREPACK_RUN_COMMAND:
        invariant(args.kind === "run");
        this._onDebuggeeResume();
        return true;
      case DebugMessage.STACKFRAMES_COMMAND:
        invariant(args.kind === "stackframe");
        this.processStackframesCommand(requestID, args, loc);
        break;
      case DebugMessage.SCOPES_COMMAND:
        invariant(args.kind === "scopes");
        this.processScopesCommand(requestID, args);
        break;
      case DebugMessage.VARIABLES_COMMAND:
        invariant(args.kind === "variables");
        this.processVariablesCommand(requestID, args);
        break;
      case DebugMessage.STEPINTO_COMMAND:
        invariant(loc !== undefined);
        this._stepManager.processStepCommand("in", loc);
        this._onDebuggeeResume();
        return true;
      case DebugMessage.STEPOVER_COMMAND:
        invariant(loc !== undefined);
        this._stepManager.processStepCommand("over", loc);
        this._onDebuggeeResume();
        return true;
      case DebugMessage.STEPOUT_COMMAND:
        invariant(loc !== undefined);
        this._stepManager.processStepCommand("out", loc);
        this._onDebuggeeResume();
        return true;
      case DebugMessage.EVALUATE_COMMAND:
        invariant(args.kind === "evaluate");
        this.processEvaluateCommand(requestID, args);
        break;
      default:
        throw new DebuggerError("Invalid command", "Invalid command from adapter: " + command);
    }
    return false;
  }

  processStackframesCommand(
    requestID: number,
    args: StackframeArguments,
    astLoc: void | BabelNodeSourceLocation
  ): void {
    let frameInfos: Array<Stackframe> = [];
    let loc = this._getFrameLocation(astLoc ? astLoc : null);
    let fileName = loc.fileName;
    let line = loc.line;
    let column = loc.column;

    // the UI displays the current frame as index 0, so we iterate backwards
    // from the current frame
    for (let i = this._realm.contextStack.length - 1; i >= 0; i--) {
      let frame = this._realm.contextStack[i];
      let functionName = "(anonymous function)";
      if (frame.function && frame.function.__originalName !== undefined) {
        functionName = frame.function.__originalName;
      }

      let frameInfo: Stackframe = {
        id: this._realm.contextStack.length - 1 - i,
        functionName: functionName,
        fileName: this._sourceMapManager.relativeToAbsolute(fileName), // Outward facing paths must be absolute.
        line: line,
        column: column,
      };
      frameInfos.push(frameInfo);
      loc = this._getFrameLocation(frame.loc);
      fileName = loc.fileName;
      line = loc.line;
      column = loc.column;
    }
    this._channel.sendStackframeResponse(requestID, frameInfos);
  }

  _getFrameLocation(loc: void | null | BabelNodeSourceLocation): { fileName: string, line: number, column: number } {
    let fileName = "unknown";
    let line = 0;
    let column = 0;
    if (loc && loc.source !== null) {
      fileName = loc.source;
      line = loc.start.line;
      column = loc.start.column;
    }
    return {
      fileName: fileName,
      line: line,
      column: column,
    };
  }

  processScopesCommand(requestID: number, args: ScopesArguments): void {
    // first check that frameId is in the valid range
    if (args.frameId < 0 || args.frameId >= this._realm.contextStack.length) {
      throw new DebuggerError("Invalid command", "Invalid frame id for scopes request: " + args.frameId);
    }
    // here the frameId is in reverse order of the contextStack, ie frameId 0
    // refers to last element of contextStack
    let stackIndex = this._realm.contextStack.length - 1 - args.frameId;
    let context = this._realm.contextStack[stackIndex];
    invariant(context instanceof ExecutionContext);
    let scopes = [];
    let lexicalEnv = context.lexicalEnvironment;
    while (lexicalEnv) {
      let scope: Scope = {
        name: this._getScopeName(lexicalEnv.environmentRecord),
        // key used by UI to retrieve variables in this scope
        variablesReference: this._variableManager.getReferenceForValue(lexicalEnv),
        // the variables are easy to retrieve
        expensive: false,
      };
      scopes.push(scope);
      lexicalEnv = lexicalEnv.parent;
    }
    this._channel.sendScopesResponse(requestID, scopes);
  }

  _getScopeName(envRec: EnvironmentRecord): string {
    if (envRec instanceof GlobalEnvironmentRecord) {
      return "Global";
    } else if (envRec instanceof DeclarativeEnvironmentRecord) {
      if (envRec instanceof FunctionEnvironmentRecord) {
        let name = envRec.$FunctionObject.__originalName;
        if (name === undefined) name = "anonymous function";
        return "Local: " + name;
      } else {
        return "Block";
      }
    } else if (envRec instanceof ObjectEnvironmentRecord) {
      return "With";
    } else {
      invariant(false, "Invalid type of environment record");
    }
  }

  processVariablesCommand(requestID: number, args: VariablesArguments): void {
    let variables = this._variableManager.getVariablesByReference(args.variablesReference);
    this._channel.sendVariablesResponse(requestID, variables);
  }

  processEvaluateCommand(requestID: number, args: EvaluateArguments): void {
    let evalResult = this._variableManager.evaluate(args.frameId, args.expression);
    this._channel.sendEvaluateResponse(requestID, evalResult);
  }

  // actions that need to happen before Prepack can resume
  _onDebuggeeResume(): void {
    // resets the variable manager
    this._variableManager.clean();
  }

  /*
    Returns whether there are more nodes in the ast.
  */
  _checkAndUpdateLastExecuted(ast: BabelNode): boolean {
    if (ast.loc && ast.loc.source !== null) {
      let filePath = ast.loc.source;
      let line = ast.loc.start.line;
      let column = ast.loc.start.column;
      let stackSize = this._realm.contextStack.length;
      // Check if the current location is same as the last one.
      // Does not check columns since column debugging is not supported.
      // Column support is unnecessary because these nodes will have been sourcemap-translated.
      // Ignoring columns prevents:
      //     - Lines with multiple AST nodes from triggering the same breakpoint more than once.
      //     - Step-out from completing in the same line that it was set in.
      if (
        this._lastExecuted &&
        filePath === this._lastExecuted.filePath &&
        line === this._lastExecuted.line &&
        stackSize === this._lastExecuted.stackSize
      ) {
        return false;
      }
      this._lastExecuted = {
        filePath: filePath,
        line: line,
        column: column,
        stackSize: this._realm.contextStack.length,
      };
      return true;
    }
    return false;
  }

  //  Displays Prepack error message, then waits for user to run the program to continue (similar to a breakpoint).
  handlePrepackError(diagnostic: CompilerDiagnostic): void {
    invariant(diagnostic.location && diagnostic.location.source !== null);
    // The following constructs the message and stop-instruction that is sent to the UI to actually stop the execution.
    let location = diagnostic.location;
    let absoluteSource = "";
    if (location.source !== null) absoluteSource = this._sourceMapManager.relativeToAbsolute(location.source);
    let message = `${diagnostic.severity} ${diagnostic.errorCode}: ${diagnostic.message}`;
    console.log(message);
    this._channel.sendStoppedResponse(
      "Diagnostic",
      absoluteSource,
      location.start.line,
      location.start.column,
      message
    );

    // The AST Node's location is needed to satisfy the subsequent stackTrace request.
    this.waitForRun(location);
  }
  // Return whether the debugger should stop on a CompilerDiagnostic of a given severity.
  shouldStopForSeverity(severity: Severity): boolean {
    switch (this._diagnosticSeverity) {
      case "Information":
        return true;
      case "Warning":
        return severity !== "Information";
      case "RecoverableError":
        return severity === "RecoverableError" || severity === "FatalError";
      case "FatalError":
        return severity === "FatalError";
      default:
        invariant(false, "Unexpected severity type");
    }
  }

  shutdown(): void {
    // clean the channel pipes
    this._channel.shutdown();
  }
}
