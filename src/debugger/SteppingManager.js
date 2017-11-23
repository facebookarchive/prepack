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
import type { StepIntoData } from "./types.js";
import invariant from "./../invariant.js";
import { IsStatement } from "./../methods/is.js";

export class SteppingManager {
  constructor(channel: DebugChannel) {
    this._channel = channel;
  }
  _channel: DebugChannel;
  _stepIntoData: void | StepIntoData;

  processStepCommand(kind: "in" | "over" | "out", currentNode: BabelNode) {
    if (kind === "in") {
      this._processStepIn(currentNode);
    }
    // TODO: implement stepOver and stepOut
  }

  _processStepIn(ast: BabelNode) {
    invariant(this._steppInData === undefined);
    invariant(ast.loc && ast.loc.source);
    this._stepIntoData = {
      prevStopFile: ast.loc.source,
      prevStopLine: ast.loc.start.line,
      prevStopColumn: ast.loc.start.column,
    };
  }

  isStepComplete(ast: BabelNode): boolean {
    if (this._isStepIntoComplete(ast)) {
      if (ast.loc && ast.loc.source) {
        this._stepIntoData = undefined;
        this._channel.sendStoppedResponse("Step Into", ast.loc.source, ast.loc.start.line, ast.loc.start.column);
        return true;
      }
    }
    return false;
  }

  _isStepIntoComplete(ast: BabelNode): boolean {
    // we should only step to statements
    if (!IsStatement(ast)) return false;
    let loc = ast.loc;
    if (!loc) return false;
    let filePath = loc.source;
    let line = loc.start.line;
    let column = loc.start.column;
    if (!filePath) return false;
    if (this._stepIntoData) {
      if (
        filePath === this._stepIntoData.prevStopFile &&
        line === this._stepIntoData.prevStopLine &&
        column === this._stepIntoData.prevStopColumn
      ) {
        return false;
      }
    } else {
      return false;
    }

    return true;
  }
}
