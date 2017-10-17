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
import type { Effects } from "../realm.js";

import invariant from "../invariant.js";
import { Value, EmptyValue, FunctionValue } from "../values/index.js";
import { ResidualHeapInspector } from "./ResidualHeapInspector.js";
import { ResidualHeapVisitor } from "./ResidualHeapVisitor.js";

export class ResidualHeapRefCounter extends ResidualHeapVisitor {
  constructor(
    realm: Realm,
    logger: Logger,
    modules: Modules,
    additionalFunctionValuesAndEffects: Map<FunctionValue, Effects>
  ) {
    super(realm, logger, modules, additionalFunctionValuesAndEffects);
    this._valueToEdgeRecord = new Map();
    this._ancestors = [];
  }

  _valueToEdgeRecord: Map<Value, [number, number]>;
  _ancestors: Array<Value>;

  getResult(): Map<Value, [number, number]> {
    return this._valueToEdgeRecord;
  }

  _shouldIgnore(val: Value): boolean {
    return val instanceof EmptyValue || val.isIntrinsic() || ResidualHeapInspector.isLeaf(val);
  }

  _updateParentOutgoingEdgeCount() {
    const parent = this._ancestors[this._ancestors.length - 1];
    const edgeRecord = this._valueToEdgeRecord.get(parent);
    invariant(edgeRecord);
    ++edgeRecord[1];
  }

  _updateValueIncomingEdgeCount(val: Value): boolean {
    let edgeRecord = this._valueToEdgeRecord.get(val);
    if (edgeRecord === undefined) {
      this._valueToEdgeRecord.set(val, [1, 0]);
      return true;
    } else {
      ++edgeRecord[0];
      return false; // visited node, skip its children.
    }
  }

  _mark(val: Value): boolean {
    if (this._shouldIgnore(val)) {
      return false;
    }

    if (this._ancestors.length > 0) {
      this._updateParentOutgoingEdgeCount();
    }
    this._ancestors.push(val);

    return this._updateValueIncomingEdgeCount(val);
  }

  _postProcessValue(val: Value, childrenPassCheck: boolean): boolean {
    if (this._shouldIgnore(val)) {
      return true;
    }

    invariant(this._ancestors.length > 0);
    this._ancestors.pop();
    return true;
  }
}
