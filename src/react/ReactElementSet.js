/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { Realm } from "../realm.js";
import { ObjectValue, Value } from "../values/index.js";
import invariant from "../invariant.js";
import { type ReactSetKeyMap, ReactSet } from "./ReactSet.js";
import { ResidualReactElementVisitor } from "../serializer/ResidualReactElementVisitor.js";

export class ReactElementSet extends ReactSet {
  constructor(realm: Realm, residualReactElementVisitor: ResidualReactElementVisitor) {
    super(realm, residualReactElementVisitor);
    this.reactElementRoot = new Map();
  }
  reactElementRoot: ReactSetKeyMap;

  add(reactElement: ObjectValue, visitedValues: Set<Value> | void): ObjectValue {
    if (!visitedValues) visitedValues = new Set();
    let currentMap = this.reactElementRoot;

    // type
    currentMap = this._getKey("type", currentMap, visitedValues);
    let type = this._getEquivalentPropertyValue(reactElement, "type");
    let result = this._getValue(type, currentMap, visitedValues);
    currentMap = result.map;
    // key
    currentMap = this._getKey("key", currentMap, visitedValues);
    let key = this._getEquivalentPropertyValue(reactElement, "key");
    result = this._getValue(key, currentMap, visitedValues);
    currentMap = result.map;
    // ref
    currentMap = this._getKey("ref", currentMap, visitedValues);
    let ref = this._getEquivalentPropertyValue(reactElement, "ref");
    result = this._getValue(ref, currentMap, visitedValues);
    currentMap = result.map;
    // props
    currentMap = this._getKey("props", currentMap, visitedValues);
    let props = this._getEquivalentPropertyValue(reactElement, "props");
    result = this._getValue(props, currentMap, visitedValues);

    if (result.value === null) {
      result.value = reactElement;
    }
    invariant(result.value instanceof ObjectValue);
    return result.value;
  }
}
