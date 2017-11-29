/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { BabelNode } from "babel-types";
import type { DebugChannel } from "./channel/DebugChannel.js";
import type { StoppedReason } from "./types.js";
import invariant from "./../invariant.js";
import { StepIntoStepper } from "./Stepper.js";

export class SteppingManager {
  constructor(channel: DebugChannel) {
    this._channel = channel;
  }
  _channel: DebugChannel;
  _stepInto: void | StepIntoStepper;

  processStepCommand(kind: "in" | "over" | "out", currentNode: BabelNode) {
    if (kind === "in") {
      this._processStepIn(currentNode);
    }
    // TODO: implement stepOver and stepOut
  }

  _processStepIn(ast: BabelNode) {
    invariant(this._stepInto === undefined);
    invariant(ast.loc && ast.loc.source);
    this._stepInto = new StepIntoStepper(ast.loc.source, ast.loc.start.line, ast.loc.start.column);
  }

  isStepComplete(ast: BabelNode): boolean {
    if (ast.loc && ast.loc.source) {
      if (this._stepInto && this._stepInto.isComplete(ast)) {
        this._stepInto = undefined;
        this._channel.sendStoppedResponse("Step Into", ast.loc.source, ast.loc.start.line, ast.loc.start.column);
        return true;
      }
    }
    return false;
  }

  onDebuggeeStop(ast: BabelNode, reason: StoppedReason) {
    if (reason !== "Step Into") {
      // stopped for another reason, e.g. breakpoint
      if (this._stepInto !== undefined) {
        // we're in the middle of a step into, but debuggee has stopped for another reason here first, so cancel this step into
        this._stepInto = undefined;
      }
    }

    //TODO: handle other stepping related stopped reasons when they are implemented
  }
}
