/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict */

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
  // Command to fetch stack frames
  static STACKFRAMES_COMMAND: string = "Stackframes-command";
  // Command to fetch scopes
  static SCOPES_COMMAND: string = "Scopes-command";
  // Command to fetch variables
  static VARIABLES_COMMAND: string = "Variables-command";
  // Command to step into a function
  static STEPINTO_COMMAND: string = "StepInto-command";
  // Command to step over a function
  static STEPOVER_COMMAND: string = "StepOver-command";
  // Command to evaluate an expression
  static EVALUATE_COMMAND: string = "Evaluate-command";

  /* Messages from Prepack to adapter with requested information */
  // Respond to the adapter that Prepack is ready
  static PREPACK_READY_RESPONSE: string = "PrepackReady";
  // Respond to the adapter that Prepack is finished
  static PREPACK_FINISH_RESPONSE: string = "PrepackFinish";
  // Respond to the adapter that Prepack has stopped
  static STOPPED_RESPONSE: string = "Stopped-response";
  // Respond to the adapter with the request stackframes
  static STACKFRAMES_RESPONSE: string = "Stackframes-response";
  // Respond to the adapter with the requested scopes
  static SCOPES_RESPONSE: string = "Scopes-response";
  // Respond to the adapter with the requested variables
  static VARIABLES_RESPONSE: string = "Variables-response";
  // Respond to the adapter with the stepped in location
  static STEPINTO_RESPONSE: string = "StepInto-response";
  // Respond to the adapter with the evaluation results
  static EVALUATE_RESPONSE: string = "Evaluate-response";

  /* Messages from Prepack to adapter to acknowledge having received the request */
  // Acknowledgement for setting a breakpoint
  static BREAKPOINT_ADD_ACKNOWLEDGE: string = "Breakpoint-add-acknowledge";
  // Acknowledgement for removing a breakpoint
  static BREAKPOINT_REMOVE_ACKNOWLEDGE: string = "Breakpoint-remove-acknowledge";
  // Acknowledgement for enabling a breakpoint
  static BREAKPOINT_ENABLE_ACKNOWLEDGE: string = "Breakpoint-enable-acknowledge";
  // Acknoledgement for disabling a breakpoint
  static BREAKPOINT_DISABLE_ACKNOWLEDGE: string = "Breakpoint-disable-acknowledge";
}
