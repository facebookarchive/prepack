/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */
import * as DebugProtocol from "vscode-debugprotocol";

export type DebuggerRequest = {
  id: number,
  command: string,
  arguments: DebuggerRequestArguments,
};

export type DebuggerRequestArguments = BreakpointArguments | RunArguments | StackframeArguments;

export type PrepackLaunchArguments = {
  kind: "launch",
  prepackCommand: string,
  inFilePath: string,
  outFilePath: string,
  outputCallback: Buffer => void,
  exitCallback: () => void,
};

export type BreakpointArguments = {
  kind: "breakpoint",
  filePath: string,
  line: number,
  column: number,
};

export type RunArguments = {
  kind: "run",
};

export type StackframeArguments = {
  kind: "stackframe",
};

export type Stackframe = {
  id: number,
  fileName: string,
  line: number,
  column: number,
  functionName: string,
};

export type DebuggerResponse = {
  id: number,
  result: DebuggerResponseResult,
};

export type DebuggerResponseResult = ReadyResult | StackframeResult | BreakpointAddResult | BreakpointStoppedResult;

export type ReadyResult = {
  kind: "ready",
};

export type StackframeResult = {
  kind: "stackframe",
  stackframes: Array<Stackframe>,
};

export type BreakpointAddResult = {
  kind: "breakpoint-add",
};

export type BreakpointStoppedResult = {
  kind: "breakpoint-stopped",
  filePath: string,
  line: number,
  column: number,
};

export interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
  prepackCommand: string,
  inFilePath: string,
  outFilePath: string,
};
