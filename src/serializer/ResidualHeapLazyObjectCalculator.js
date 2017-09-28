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
import {
  Value,
  EmptyValue,
  FunctionValue,
  AbstractValue,
  SymbolValue,
  ProxyValue,
  ObjectValue,
} from "../values/index.js";
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
    this._statistics = {
      rc1: 0,
      rc2: 0,
      others: 0,
      trees: 0,
      breakNodes: {
        func: 0,
        abstract: 0,
        proxy: 0,
        symbol: 0,
        object: 0,
        others: 0,
      },
      popularBreakNodes: {
        func: 0,
        abstract: 0,
        proxy: 0,
        symbol: 0,
        object: 0,
        others: 0,
      },
    };
  }

  _valueToReferencCount: Map<Value, number>;
  _lazyObjects: Set<Value>;
  _visitedValues: Set<Value>;
  _statistics: any;

  _mark(val: Value): boolean {
    if (this._visitedValues.has(val)) {
      return false; // Already visited.
    }
    this._visitedValues.add(val);
    return true;
  }

  _recordBreakNodeStatistics(val: Value, breakNode: any) {
    if (val instanceof FunctionValue) {
      ++breakNode.func;
    } else if (val instanceof AbstractValue) {
      ++breakNode.abstract;
    } else if (val instanceof ProxyValue) {
      ++breakNode.proxy;
    } else if (val instanceof SymbolValue) {
      ++breakNode.symbol;
    } else if (val instanceof ObjectValue) {
      ++breakNode.object;
    } else {
      ++breakNode.others;
    }
  }

  _postProcessValue(val: Value, childrenPassCheck: boolean): boolean {
    if (val instanceof EmptyValue || val.isIntrinsic() || ResidualHeapInspector.isLeaf(val)) {
      // Leaf should have no children.
      return true;
    }
    let refCount = this._valueToReferencCount.get(val);
    invariant(refCount != null);
    if (!this._lazyObjects.has(val) && childrenPassCheck && refCount > 1) {
      ++this._statistics.trees;
      this._recordBreakNodeStatistics(val, this._statistics.breakNodes);
      if (refCount > 20) {
        this._recordBreakNodeStatistics(val, this._statistics.popularBreakNodes);
      }
    }
    if (childrenPassCheck) {
      this._lazyObjects.add(val);
    }
    return refCount === 1 && childrenPassCheck;
  }

  repotResult() {
    invariant(this._valueToReferencCount.size >= this._lazyObjects.size);
    this._statistics = Array.from(this._valueToReferencCount.values()).reduce((prev: any, rc) => {
      invariant(rc > 0);
      if (rc === 1) {
        ++prev.rc1;
      } else if (rc === 2) {
        ++prev.rc2;
      } else {
        ++prev.others;
      }
      return prev;
    }, this._statistics);
    console.log(`Ref count statistics: [${JSON.stringify(this._statistics)}]`);
    console.log(`JS Heap: total[${this._valueToReferencCount.size}], lazy object[${this._lazyObjects.size}]\n`);
  }
}
