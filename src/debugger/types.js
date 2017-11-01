/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

export type DebuggerRequest = {
  id: number,
  command: string,
  arguments: DebuggerRequestArguments,
};

export type DebuggerRequestArguments = BreakpointArguments | RunArguments | StackframeArguments;

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
}

export type Stackframe = {
  fileName: string,
  line: number,
  column: number,
  functionName: string,
}
