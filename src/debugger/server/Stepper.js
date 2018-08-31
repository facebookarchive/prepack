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
import { BabelNode } from "@babel/types";
import invariant from "./../common/invariant.js";

export class Stepper {
  constructor(filePath: string, line: number, column: number, stackSize: number) {
    this._stepStartData = {
      filePath: filePath,
      line: line,
      column: column,
      stackSize: stackSize,
    };
  }
  _stepStartData: SourceData;

  isComplete(ast: BabelNode, currentStackSize: number): boolean {
    invariant(false, "Abstract method, please override");
  }

  // NOTE: Only checks if a node has changed within the same callstack.
  // The same node in two different excutions contexts (e.g. recursive call)
  // will not be detected. Check the stackSize (via realm) in those cases.
  isAstLocationChanged(ast: BabelNode): boolean {
    let loc = ast.loc;
    if (!loc) return false;
    let filePath = loc.source;
    let line = loc.start.line;
    let column = loc.start.column;
    if (filePath === null) return false;
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
    // the AST node is the same (e.g. a recursive call).
    return this.isAstLocationChanged(ast) || currentStackSize !== this._stepStartData.stackSize;
  }
}

export class StepOverStepper extends Stepper {
  constructor(filePath: string, line: number, column: number, stackSize: number) {
    super(filePath, line, column, stackSize);
  }

  isComplete(ast: BabelNode, currentStackSize: number): boolean {
    return (
      // If current stack length < starting stack length, the program either
      // hit an exception so this stepper is no longer relevant. Or, the program
      // has stepped out of a function call, back up to the calling function.
      currentStackSize < this._stepStartData.stackSize ||
      // If current stack length === starting stack length, the program returned
      // to the same stack depth. As long as the ast node has changed,
      // the step over is complete.
      (currentStackSize === this._stepStartData.stackSize && this.isAstLocationChanged(ast))
    );
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
    return currentStackSize < this._stepStartData.stackSize;
  }
}
