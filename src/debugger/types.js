/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { LexicalEnvironment } from "./../environment.js";
import * as DebugProtocol from "vscode-debugprotocol";
import { ObjectValue, AbstractValue } from "./../values/index.js";

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
  | StepIntoArguments;

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
  | VariablesResult;

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

// any object that can contain a collection of variables
export type VariableContainer = LexicalEnvironment | ObjectValue | AbstractValue;
export interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
  noDebug?: boolean,
  sourceFile: string,
  prepackRuntime: string,
  prepackArguments: Array<string>,
  debugInFilePath: string,
  debugOutFilePath: string,
}

export type StoppedReason = "Entry" | "Breakpoint" | "Step Into";

export type StoppedData = {
  filePath: string,
  line: number,
  column: number,
};

export type StepIntoData = {
  prevStopData: void | StoppedData,
};
