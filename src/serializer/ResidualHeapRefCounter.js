/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import type { Logger } from "../utils/logger.js";
import type { Modules } from "../utils/modules.js";
import type { Realm } from "../realm.js";
import type { ObjectRefCount, AdditionalFunctionEffects } from "./types.js";

import invariant from "../invariant.js";
import { Value, EmptyValue, FunctionValue } from "../values/index.js";
import { HeapInspector } from "../utils/HeapInspector.js";
import { ResidualHeapVisitor } from "./ResidualHeapVisitor.js";

/**
 * Record residual heap object's incoming and outgoing reference counts.
 */
export class ResidualHeapRefCounter extends ResidualHeapVisitor {
  constructor(
    realm: Realm,
    logger: Logger,
    modules: Modules,
    additionalFunctionValuesAndEffects: Map<FunctionValue, AdditionalFunctionEffects>
  ) {
    super(realm, logger, modules, additionalFunctionValuesAndEffects);
    this._valueToEdgeRecord = new Map();
    this._path = [];
  }

  _valueToEdgeRecord: Map<Value, ObjectRefCount>;
  _path: Array<Value>; // Contains the path of nodes from root to current visiting node.

  getResult(): Map<Value, ObjectRefCount> {
    return this._valueToEdgeRecord;
  }

  _shouldIgnore(val: Value): boolean {
    return val instanceof EmptyValue || val.isIntrinsic() || HeapInspector.isLeaf(val);
  }

  preProcessValue(val: Value): boolean {
    if (this._shouldIgnore(val)) {
      return false;
    }

    if (this._path.length > 0) {
      this._updateParentOutgoingEdgeCount();
    }
    this._path.push(val);

    return this._updateValueIncomingEdgeCount(val);
  }

  _updateParentOutgoingEdgeCount(): void {
    const parent = this._path[this._path.length - 1];
    const edgeRecord = this._valueToEdgeRecord.get(parent);
    invariant(edgeRecord);
    ++edgeRecord.outGoing;
  }

  _updateValueIncomingEdgeCount(val: Value): boolean {
    let edgeRecord = this._valueToEdgeRecord.get(val);
    if (edgeRecord === undefined) {
      this._valueToEdgeRecord.set(val, {
        inComing: 1,
        outGoing: 0,
      });
      return true;
    } else {
      ++edgeRecord.inComing;
      return false; // visited node, skip its children.
    }
  }

  // Override.
  postProcessValue(val: Value): void {
    if (this._shouldIgnore(val)) {
      return;
    }
    invariant(this._path.length > 0);
    this._path.pop();
  }

  // Override.
  visitRoots(): void {
    super.visitRoots();
    invariant(this._path.length === 0, "Path should be balanced empty after traversal.");
  }
}
