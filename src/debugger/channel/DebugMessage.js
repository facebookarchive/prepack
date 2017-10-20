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
  static DEBUGGER_ATTACHED: string = "Debugger Attached";
  static PREPACK_READY: string = "Prepack Ready";
  static PREPACK_RUN: string = "Prepack Run";
  static PREPACK_FINISH: string = "Prepack Finish";
}
