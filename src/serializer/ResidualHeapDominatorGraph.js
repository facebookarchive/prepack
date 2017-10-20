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
import { ResidualHeapReachableObjectCollector } from "./ResidualHeapReachableObjectCollector.js";

export class ResidualHeapDominatorGraph {
  constructor(
    realm: Realm,
    logger: Logger,
    modules: Modules,
    additionalFunctionValuesAndEffects: Map<FunctionValue, Effects>
  ) {
    this._realm = realm;
    this._logger = logger;
    this._modules = modules;
    this._additionalFunctionValuesAndEffects = additionalFunctionValuesAndEffects;
  }

  _realm: Realm;
  _logger: Logger;
  _modules: Modules;
  _additionalFunctionValuesAndEffects: Map<FunctionValue, Effects>;

  _calculateRemainingObjects(fullHeap: Map<Value, number>, reachableHeap: Map<Value, number>): Map<Value, number> {
    const fullHeapCopy = new Map(fullHeap);
    for (const reachableObject of reachableHeap.keys()) {
      const existInFullHeap = fullHeapCopy.delete(reachableObject);
      invariant(existInFullHeap);
    }
    return fullHeapCopy;
  }

  construct(): Map<Value, Value> {
    const fullHeapIdCollector = new ResidualHeapReachableObjectCollector(
      this._realm,
      this._logger,
      this._modules,
      this._additionalFunctionValuesAndEffects
    );
    fullHeapIdCollector.visitRoots();
    const fullHeapAndIds = fullHeapIdCollector.getResult();

    const valueImmediateDominators: Map<Value, Value> = new Map();
    for (const [newDominator, newDominatorId] of fullHeapAndIds) {
      const reachableHeapCollector = new ResidualHeapReachableObjectCollector(
        this._realm,
        this._logger,
        this._modules,
        this._additionalFunctionValuesAndEffects,
        newDominator
      );
      reachableHeapCollector.visitRoots();

      console.log(`Get dominated objects for dominator: ${newDominatorId}`);

      const reachableHeapObjects = reachableHeapCollector.getResult();
      const remainingObjects = this._calculateRemainingObjects(fullHeapAndIds, reachableHeapObjects);

      // Update valueImmediateDominators.
      for (const remainingObject of remainingObjects.keys()) {
        const prevDominator = valueImmediateDominators.get(remainingObject);
        if (prevDominator === undefined) {
          valueImmediateDominators.set(remainingObject, newDominator);
        } else {
          const prevDominatorId = fullHeapAndIds.get(prevDominator);
          invariant(prevDominatorId != null);
          invariant(prevDominatorId !== newDominatorId);

          if (newDominatorId > prevDominatorId) {
            valueImmediateDominators.set(remainingObject, newDominator);
          }
        }
      }
    }
    return valueImmediateDominators;
  }
}
