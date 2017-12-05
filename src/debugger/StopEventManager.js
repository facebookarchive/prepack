/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import invariant from "./../invariant.js";
import type { DebugChannel } from "./channel/DebugChannel.js";
import { Breakpoint } from "./Breakpoint.js";
import { Stepper, StepIntoStepper, StepOverStepper } from "./Stepper.js";
import { BabelNode } from "babel-types";

export type StoppableObject = Breakpoint | Stepper;

export class StopEventManager {
  constructor(channel: DebugChannel) {
    this._channel = channel;
  }
  _channel: DebugChannel;

  shouldDebuggeeStop(ast: BabelNode, stoppables: Array<StoppableObject>): boolean {
    if (stoppables.length === 0) return false;
    let stoppable = stoppables[0];
    let stoppedReason;
    if (stoppable instanceof Breakpoint) {
      stoppedReason = "Breakpoint";
    } else if (stoppable instanceof StepIntoStepper) {
      stoppedReason = "Step Into";
    } else if (stoppable instanceof StepOverStepper) {
      stoppedReason = "Step Over";
    } else {
      invariant(false, "Invalid stoppable object");
    }
    invariant(ast.loc && ast.loc.source);
    this._channel.sendStoppedResponse(stoppedReason, ast.loc.source, ast.loc.start.line, ast.loc.start.column);
    return true;
  }
}
