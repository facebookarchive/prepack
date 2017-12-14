/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { Logger } from "./logger.js";
import type { Modules } from "./modules.js";
import type { Realm } from "../realm.js";
import type { GraphNodeEdgeRecord, AdditionalFunctionEffects } from "./types.js";

import invariant from "../invariant.js";
import { Value, EmptyValue, FunctionValue } from "../values/index.js";
import { ResidualHeapInspector } from "./ResidualHeapInspector.js";
import { ResidualHeapVisitor } from "./ResidualHeapVisitor.js";
import { getOrDefault } from "./utils.js";
import { Generator } from "../utils/generator";

/**
 * Record residual heap graph node's incoming and outgoing edge information.
 */
export class ResidualHeapGraphRecord extends ResidualHeapVisitor {
  constructor(
    realm: Realm,
    logger: Logger,
    modules: Modules,
    additionalFunctionValuesAndEffects: Map<FunctionValue, AdditionalFunctionEffects>
  ) {
    super(realm, logger, modules, additionalFunctionValuesAndEffects);
    this._edgeRecords = new Map();
    this._path = [];
  }

  _edgeRecords: Map<Value, GraphNodeEdgeRecord>;
  _path: Array<Value>; // Contains the path of nodes from root to current visiting node.

  getResult(): Map<Value, GraphNodeEdgeRecord> {
    return this._edgeRecords;
  }

  _shouldIgnore(visitValue: Value): boolean {
    return visitValue instanceof EmptyValue || visitValue.isIntrinsic() || ResidualHeapInspector.isLeaf(visitValue);
  }

  // Override.
  preProcessValue(visitValue: Value): boolean {
    if (this._shouldIgnore(visitValue)) {
      return false;
    }
    this._updateParentOutgoingEdgeRecord(visitValue);
    const nodeVisited = this._updateValueIncomingEdgeRecord(visitValue);
    this._path.push(visitValue);
    return !nodeVisited; // Skip the children of visited node.
  }

  _updateParentOutgoingEdgeRecord(visitValue: Value) {
    const parent = this._getParent();
    if (parent === undefined) {
      // No parent, root node.
      return;
    }
    const parentNodeRecord = this._edgeRecords.get(parent);
    invariant(parentNodeRecord);
    parentNodeRecord.outGoing.push(visitValue);
  }

  _getParent(): void | Value {
    return this._path.length > 0 ? this._path[this._path.length - 1] : undefined;
  }

  _updateValueIncomingEdgeRecord(visitValue: Value): boolean {
    const visited = this._edgeRecords.has(visitValue);
    const nodeRecord = getOrDefault(this._edgeRecords, visitValue, () => {
      return {
        inComing: [],
        outGoing: [],
      };
    });
    const parent = this._getParent();
    if (parent !== undefined) {
      nodeRecord.inComing.push(parent);
    } else {
      // For root node directly from generator, we track its generator as well.
      const referencedGenerator = this.scope;
      invariant(referencedGenerator instanceof Generator, "Root node should be referenced by generator");
      nodeRecord.inComing.push(referencedGenerator);
    }
    return visited;
  }

  // Override.
  postProcessValue(val: Value) {
    if (this._shouldIgnore(val)) {
      return;
    }
    invariant(this._path.length > 0);
    this._path.pop();
  }

  // Override.
  visitRoots(): void {
    super.visitRoots();
    invariant(this._path.length === 0);
  }
}
