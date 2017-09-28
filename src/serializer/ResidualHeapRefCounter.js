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
    this._valueToReferencCount = new Map();
  }

  _valueToReferencCount: Map<Value, number>;

  getResult(): Map<Value, number> {
    return this._valueToReferencCount;
  }

  _mark(val: Value): boolean {
    if (val instanceof EmptyValue || val.isIntrinsic() || ResidualHeapInspector.isLeaf(val)) {
      return false;
    }

    let refCount = this._valueToReferencCount.get(val);
    if (refCount === undefined) {
      this._valueToReferencCount.set(val, 1);
      return true;
    } else {
      this._valueToReferencCount.set(val, refCount + 1);
      return false; // visited node, skip its children.
    }
  }
}
