/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import invariant from "./../common/invariant.js";
import { Breakpoint } from "./Breakpoint.js";
import { Stepper, StepIntoStepper, StepOverStepper, StepOutStepper } from "./Stepper.js";
import { BabelNode } from "@babel/types";
import type { StoppedReason } from "./../common/types.js";

export type StoppableObject = Breakpoint | Stepper;

// Manage whether the debuggee should stop
// All stopping related logic is centralized here

export class StopEventManager {
  // stoppables is a list of objects the debuggee should be stopped on
  // (e.g. breakpoint, completed steppers). The debuggee should stop if there
  // is at least one element in the list. Currently the reason of the first element
  // is chosen as the reason sent to the UI
  getDebuggeeStopReason(ast: BabelNode, stoppables: Array<StoppableObject>): void | StoppedReason {
    if (stoppables.length === 0) return;
    let stoppable = stoppables[0];
    let stoppedReason;
    if (stoppable instanceof Breakpoint) {
      stoppedReason = "Breakpoint";
    } else if (stoppable instanceof StepIntoStepper) {
      stoppedReason = "Step Into";
    } else if (stoppable instanceof StepOverStepper) {
      stoppedReason = "Step Over";
    } else if (stoppable instanceof StepOutStepper) {
      stoppedReason = "Step Out";
    } else {
      invariant(false, "Invalid stoppable object");
    }
    return stoppedReason;
  }
}
