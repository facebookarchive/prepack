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
  /* Messages from adapter to Prepack */
  // Tell Prepack a debugger is present
  static DEBUGGER_ATTACHED: string = "DebuggerAttached";
  // Command Prepack to keep running
  static PREPACK_RUN_COMMAND: string = "PrepackRun";
  // Command to set a breakpoint
  static BREAKPOINT_ADD_COMMAND: string = "Breakpoint-add-command";
  // Command to remove a breakpoint
  static BREAKPOINT_REMOVE_COMMAND: string = "Breakpoint-remove-command";
  // Command to enable a breakpoint
  static BREAKPOINT_ENABLE_COMMAND: string = "Breakpoint-enable-command";
  // Command to disable a breakpoint
  static BREAKPOINT_DISABLE_COMMAND: string = "Breakpoint-disable-command";

  /* Messages from Prepack to adapter */
  // Respond to the adapter that Prepack is ready
  static PREPACK_READY_RESPONSE: string = "PrepackReady";
  // Respond to the adapter that Prepack is finished
  static PREPACK_FINISH_RESPONSE: string = "PrepackFinish";
  // Respond to the adapter that Prepack has stopped on a breakpoint
  static BREAKPOINT_STOPPED_RESPONSE: string = "Breakpoint-stopped";

  // Acknowledgement for running
  static PREPACK_RUN_ACKNOWLEDGE: string = "PrepackRun-Acknowledge";
  // Acknowledgement for setting a breakpoint
  static BREAKPOINT_ADD_ACKNOWLEDGE: string = "Breakpoint-add-acknowledge";
  // Acknowledgement for removing a breakpoint
  static BREAKPOINT_REMOVE_ACKNOWLEDGE: string = "Breakpoint-remove-acknowledge";
  // Acknowledgement for enabling a breakpoint
  static BREAKPOINT_ENABLE_ACKNOWLEDGE: string = "Breakpoint-enable-acknowledge";
  // Acknoledgement for disabling a breakpoint
  static BREAKPOINT_DISABLE_ACKNOWLEDGE: string = "Breakpoint-disable-acknowledge";
}
