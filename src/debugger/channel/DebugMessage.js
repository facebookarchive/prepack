/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

//A collection of messages used between Prepack and the debug adapter
export class DebugMessage {
  static DEBUGGER_ATTACHED: string = "DebuggerAttached";
  static PREPACK_READY: string = "PrepackReady";
  static PREPACK_RUN: string = "PrepackRun";
  static PREPACK_FINISH: string = "PrepackFinish";
  static BREAKPOINT: string = "Breakpoint";
  static BREAKPOINT_ADD: string = "Breakpoint-added";
  static BREAKPOINT_REMOVE: string = "Breakpoint-removed";
  static BREAKPOINT_ENABLE: string = "Breakpoint-enabled";
  static BREAKPOINT_DISABLE: string = "Breakpoint-disable";
  static BREAKPOINT_STOPPED: string = "Breakpoint-stopped";
}
