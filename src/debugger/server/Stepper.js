/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */
import type { SourceData } from "./../common/types.js";
import { IsStatement } from "./../../methods/is.js";
import { BabelNode } from "babel-types";
import invariant from "./../common/invariant.js";

export class Stepper {
  constructor(filePath: string, line: number, column: number) {
    this._stepStartData = {
      filePath: filePath,
      line: line,
      column: column,
    };
  }
  _stepStartData: SourceData;

  isComplete(ast: BabelNode, currentStackSize: number): boolean {
    invariant(false, "Abstract method, please override");
  }

  isAstLocationChanged(ast: BabelNode) {
    // we should only step to statements
    if (!IsStatement(ast)) return false;
    let loc = ast.loc;
    if (!loc) return false;
    let filePath = loc.source;
    let line = loc.start.line;
    let column = loc.start.column;
    if (!filePath) return false;
    if (this._stepStartData) {
      if (
        filePath === this._stepStartData.filePath &&
        line === this._stepStartData.line &&
        column === this._stepStartData.column
      ) {
        return false;
      }
    } else {
      return false;
    }
    return true;
  }
}

export class StepIntoStepper extends Stepper {
  constructor(filePath: string, line: number, column: number) {
    super(filePath, line, column);
  }

  // Override
  isComplete(ast: BabelNode, currentStackSize: number): boolean {
    return this.isAstLocationChanged(ast);
  }
}

export class StepOverStepper extends Stepper {
  constructor(filePath: string, line: number, column: number, stackSize: number) {
    super(filePath, line, column);
    this._startStackSize = stackSize;
  }
  _startStackSize: number;

  isComplete(ast: BabelNode, currentStackSize: number): boolean {
    if (!this.isAstLocationChanged(ast)) return false;
    if (currentStackSize <= this._startStackSize) {
      // two cases here:
      // if current stack length < starting stack length, the program must have
      // hit an exception so this stepper is no longer relevant
      // if current stack length === starting stack length, the program returned
      // to the same stack depth, so a step over is complete
      return true;
    }
    return false;
  }
}
