/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */
import type { SourceData } from "./../common/types.js";
import { IsStatement } from "./../../methods/is.js";
import { BabelNode } from "babel-types";
import invariant from "./../common/invariant.js";

export class Stepper {
  constructor(filePath: string, line: number, column: number, startStackSize: number) {
    this._stepStartData = {
      filePath: filePath,
      line: line,
      column: column,
      startStackSize: startStackSize,
    };
  }
  _stepStartData: SourceData;

  isComplete(ast: BabelNode, currentStackSize: number): boolean {
    invariant(false, "Abstract method, please override");
  }

  // NOTE: Only checks if a node has changed within the same callstack.
  // The same node in two different excutions contexts (e.g. recursive call)
  // will not be detected. Check the stackSize in those cases.
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
  constructor(filePath: string, line: number, column: number, startStackSize: number) {
    super(filePath, line, column, startStackSize);
  }

  // Override
  isComplete(ast: BabelNode, currentStackSize: number): boolean {
    // If stacksize has changed, the position has changed, regardless if
    // the AST node is the same (imagine a recursive call).
    return this.isAstLocationChanged(ast) || currentStackSize !== this._stepStartData.startStackSize;
  }
}

export class StepOverStepper extends Stepper {
  constructor(filePath: string, line: number, column: number, stackSize: number) {
    super(filePath, line, column, stackSize);
  }

  isComplete(ast: BabelNode, currentStackSize: number): boolean {
    // If current stack length < starting stack length, the program must have
    // hit an exception so this stepper is no longer relevant. Or, the program
    // has stepped out of a function call, back up to the calling function.
    if (currentStackSize < this._stepStartData.startStackSize) return true;
    // If current stack length === starting stack length, the program returned
    // to the same stack depth, so a step over is complete.
    if (currentStackSize === this._stepStartData.startStackSize) return this.isAstLocationChanged(ast);

    return false;
  }
}

export class StepOutStepper extends Stepper {
  constructor(filePath: string, line: number, column: number, stackSize: number) {
    super(filePath, line, column, stackSize);
  }

  isComplete(ast: BabelNode, currentStackSize: number): boolean {
    // It is not sufficient to simply check if the AST location has changed,
    // since it is possible in recursive calls to return to the same
    // AST node, but in a *different* call stack.

    // To step out of a function, we must finish executing it.
    // When a function completes, its execution context will be
    // popped off the stack.
    return currentStackSize < this._stepStartData.startStackSize;
  }
}
