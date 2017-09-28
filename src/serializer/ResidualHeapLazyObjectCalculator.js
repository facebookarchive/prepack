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
import { Value, EmptyValue, AbstractValue, FunctionValue } from "../values/index.js";
import { ResidualHeapInspector } from "./ResidualHeapInspector.js";
import { ResidualHeapVisitor } from "./ResidualHeapVisitor.js";

export class ResidualHeapLazyObjectCalculator extends ResidualHeapVisitor {
  constructor(
    realm: Realm,
    logger: Logger,
    modules: Modules,
    additionalFunctionValuesAndEffects: Map<FunctionValue, Effects>,
    valueToReferencCount: Map<Value, number>
  ) {
    super(realm, logger, modules, additionalFunctionValuesAndEffects);
    this._valueToReferencCount = valueToReferencCount;
    this._lazyObjects = new Set();
    this._visitedValues = new Set();
  }

  _valueToReferencCount: Map<Value, number>;
  _lazyObjects: Set<Value>;
  _visitedValues: Set<Value>;

  _mark(val: Value): boolean {
    if (this._visitedValues.has(val)) {
      return false; // Already visited.
    }
    this._visitedValues.add(val);
    return true;
  }

  _postProcessValue(val: Value, childrenPassCheck: boolean): boolean {
    if (val instanceof EmptyValue || val.isIntrinsic() || ResidualHeapInspector.isLeaf(val)) {
      // Leaf should have no children.
      return true;
    }
    if (childrenPassCheck) {
      this._lazyObjects.add(val);
    }
    let refCount = this._valueToReferencCount.get(val);
    invariant(refCount != null);
    return refCount === 1 && childrenPassCheck;
  }

  repotResult() {
    invariant(this._valueToReferencCount.size >= this._lazyObjects.size);
    console.log(`JS Heap: total[${this._valueToReferencCount.size}], lazy object[${this._lazyObjects.size}]\n`);
  }
}
