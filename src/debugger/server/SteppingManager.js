/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import { BabelNodeSourceLocation } from "@babel/types";
import invariant from "./../common/invariant.js";
import { Stepper, StepIntoStepper, StepOverStepper, StepOutStepper } from "./Stepper.js";
import type { Realm } from "./../../realm.js";
import type { StoppableObject } from "./StopEventManager.js";

export class SteppingManager {
  constructor(realm: Realm, keepOldSteppers?: boolean) {
    this._realm = realm;
    this._steppers = [];
    this._keepOldSteppers = false;
    if (keepOldSteppers === true) this._keepOldSteppers = true;
  }
  _realm: Realm;
  _keepOldSteppers: boolean;
  _steppers: Array<Stepper>;

  processStepCommand(kind: "in" | "over" | "out", currentNodeLocation: BabelNodeSourceLocation): void {
    if (kind === "in") {
      this._processStepIn(currentNodeLocation);
    } else if (kind === "over") {
      this._processStepOver(currentNodeLocation);
    } else if (kind === "out") {
      this._processStepOut(currentNodeLocation);
    } else {
      invariant(false, `Invalid step type: ${kind}`);
    }
  }

  _processStepIn(loc: BabelNodeSourceLocation): void {
    invariant(loc && loc.source !== null);
    if (!this._keepOldSteppers) {
      this._steppers = [];
    }
    this._steppers.push(
      new StepIntoStepper(loc.source, loc.start.line, loc.start.column, this._realm.contextStack.length)
    );
  }

  _processStepOver(loc: BabelNodeSourceLocation): void {
    invariant(loc && loc.source !== null);
    if (!this._keepOldSteppers) {
      this._steppers = [];
    }
    this._steppers.push(
      new StepOverStepper(loc.source, loc.start.line, loc.start.column, this._realm.contextStack.length)
    );
  }

  _processStepOut(loc: BabelNodeSourceLocation): void {
    invariant(loc && loc.source !== null);
    if (!this._keepOldSteppers) {
      this._steppers = [];
    }
    this._steppers.push(
      new StepOutStepper(loc.source, loc.start.line, loc.start.column, this._realm.contextStack.length)
    );
  }

  getAndDeleteCompletedSteppers(ast: BabelNode): Array<StoppableObject> {
    invariant(ast.loc && ast.loc.source);
    let i = 0;
    let completedSteppers: Array<StoppableObject> = [];
    while (i < this._steppers.length) {
      let stepper = this._steppers[i];
      if (stepper.isComplete(ast, this._realm.contextStack.length)) {
        completedSteppers.push(stepper);
        this._steppers.splice(i, 1);
      } else {
        i++;
      }
    }
    return completedSteppers;
  }
}
