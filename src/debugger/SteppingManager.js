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
import type { StoppedReason, SteppingType } from "./types.js";
import invariant from "./../invariant.js";
import { Stepper, StepIntoStepper, StepOverStepper } from "./Stepper.js";
import type { Realm } from "./../realm.js";

export class SteppingManager {
  constructor(channel: DebugChannel, realm: Realm, keepOldSteppers?: boolean) {
    this._channel = channel;
    this._realm = realm;
    this._steppers = [];
    this._keepOldSteppers = false;
    if (keepOldSteppers) this._keepOldSteppers = true;
  }
  _channel: DebugChannel;
  _realm: Realm;
  _keepOldSteppers: boolean;
  _steppers: Array<Stepper>;

  processStepCommand(kind: "in" | "over" | "out", currentNode: BabelNode) {
    if (kind === "in") {
      this._processStepIn(currentNode);
    } else if (kind === "over") {
      this._processStepOver(currentNode);
    }
    // TODO: implement stepOver and stepOut
  }

  _processStepIn(ast: BabelNode) {
    invariant(this._stepInto === undefined);
    invariant(ast.loc && ast.loc.source);
    if (!this._keepOldSteppers) {
      this._steppers = [];
    }
    this._steppers.push(new StepIntoStepper(ast.loc.source, ast.loc.start.line, ast.loc.start.column));
  }

  _processStepOver(ast: BabelNode) {
    invariant(ast.loc && ast.loc.source);
    if (!this._keepOldSteppers) {
      this._steppers = [];
    }
    this._steppers.push(
      new StepOverStepper(ast.loc.source, ast.loc.start.line, ast.loc.start.column, this._realm.contextStack.length)
    );
  }

  getStepperType(ast: BabelNode): void | SteppingType {
    let completedStepperType = this._checkCompleteSteppers(ast);
    if (completedStepperType) {
      invariant(ast.loc && ast.loc.source);
      this._channel.sendStoppedResponse(completedStepperType, ast.loc.source, ast.loc.start.line, ast.loc.start.column);
      return completedStepperType;
    }
    return undefined;
  }

  _checkCompleteSteppers(ast: BabelNode): void | SteppingType {
    let i = 0;
    let completedStepperType;
    while (i < this._steppers.length) {
      let stepper = this._steppers[i];
      if (stepper.isComplete(ast, this._realm.contextStack.length)) {
        if (stepper instanceof StepIntoStepper) completedStepperType = "Step Into";
        if (stepper instanceof StepOverStepper) completedStepperType = "Step Over";
        this._steppers.splice(i, 1);
      } else {
        i++;
      }
    }
    return completedStepperType;
  }

  onDebuggeeStop(ast: BabelNode, reason: StoppedReason) {
    if (reason === "Breakpoint") {
      // stopped for breakpoint
      if (this._keepOldSteppers) {
        // remove only steppers that would complete
        this._checkCompleteSteppers(ast);
      } else {
        // remove all steppers
        this._steppers = [];
      }
    }
  }
}
