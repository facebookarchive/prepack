/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict */

import * as DebugProtocol from "vscode-debugprotocol";

export type DebuggerRequest = {
  id: number,
  command: string,
  arguments: DebuggerRequestArguments,
};

export type DebuggerRequestArguments =
  | BreakpointsArguments
  | RunArguments
  | StackframeArguments
  | ScopesArguments
  | VariablesArguments
  | StepIntoArguments
  | StepOverArguments
  | EvaluateArguments;

export type PrepackLaunchArguments = {
  kind: "launch",
  prepackRuntime: string,
  prepackArguments: Array<string>,
  sourceFile: string,
  debugInFilePath: string,
  debugOutFilePath: string,
  outputCallback: Buffer => void,
  exitCallback: () => void,
};

export type Breakpoint = {
  filePath: string,
  line: number,
  column: number,
};

export type BreakpointsArguments = {
  kind: "breakpoint",
  breakpoints: Array<Breakpoint>,
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

export type ScopesArguments = {
  kind: "scopes",
  frameId: number,
};

export type VariablesArguments = {
  kind: "variables",
  variablesReference: number,
};

export type StepIntoArguments = {
  kind: "stepInto",
};

export type StepOverArguments = {
  kind: "stepOver",
};

export type EvaluateArguments = {
  kind: "evaluate",
  frameId?: number,
  expression: string,
};

export type DebuggerResponse = {
  id: number,
  result: DebuggerResponseResult,
};

export type DebuggerResponseResult =
  | ReadyResult
  | StackframeResult
  | BreakpointsAddResult
  | StoppedResult
  | ScopesResult
  | VariablesResult
  | EvaluateResult;

export type ReadyResult = {
  kind: "ready",
};

export type StackframeResult = {
  kind: "stackframe",
  stackframes: Array<Stackframe>,
};

export type BreakpointsAddResult = {
  kind: "breakpoint-add",
  breakpoints: Array<Breakpoint>,
};

export type StoppedResult = {
  kind: "stopped",
  reason: StoppedReason,
  filePath: string,
  line: number,
  column: number,
};
export type Scope = {
  name: string,
  variablesReference: number,
  expensive: boolean,
};

export type ScopesResult = {
  kind: "scopes",
  scopes: Array<Scope>,
};

export type Variable = {
  name: string,
  value: string,
  variablesReference: number,
};

export type VariablesResult = {
  kind: "variables",
  variables: Array<Variable>,
};

export type EvaluateResult = {
  kind: "evaluate",
  displayValue: string,
  type: string,
  variablesReference: number,
};

export type LaunchRequestArguments = {
  ...DebugProtocol.LaunchRequestArguments,
  noDebug?: boolean,
  sourceFile: string,
  prepackRuntime: string,
  prepackArguments: Array<string>,
};

export type SteppingType = "Step Into" | "Step Over";
export type StoppedReason = "Entry" | "Breakpoint" | SteppingType;

export type SourceData = {
  filePath: string,
  line: number,
  column: number,
};
