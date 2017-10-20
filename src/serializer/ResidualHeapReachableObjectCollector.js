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

export class ResidualHeapReachableObjectCollector extends ResidualHeapVisitor {
  constructor(
    realm: Realm,
    logger: Logger,
    modules: Modules,
    additionalFunctionValuesAndEffects: Map<FunctionValue, Effects>,
    skipValue: ?Value
  ) {
    super(realm, logger, modules, additionalFunctionValuesAndEffects);
    this._reachableObjects = new Map();
    this._skipValue = skipValue;
    this._objectId = 0;
  }

  _reachableObjects: Map<Value, number>;
  _objectId: number;
  _skipValue: ?Value;

  getResult(): Map<Value, number> {
    return this._reachableObjects;
  }

  _shouldIgnore(val: Value): boolean {
    return val instanceof EmptyValue || val.isIntrinsic() || ResidualHeapInspector.isLeaf(val);
  }

  _getObjectId(): number {
    return this._objectId++;
  }

  _mark(val: Value): boolean {
    if (this._shouldIgnore(val)) {
      return false;
    }
    if (this._reachableObjects.has(val)) {
      return false; // visited node.
    }
    // Skip value itself should be reachable.
    this._reachableObjects.set(val, this._getObjectId());
    return val !== this._skipValue;
  }
}
