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

export class ReactPropsSet extends ReactSet {
  constructor(realm: Realm, residualReactElementVisitor: ResidualReactElementVisitor) {
    super(realm, residualReactElementVisitor);
    this.reactPropsRoot = new Map();
  }
  reactPropsRoot: ReactSetKeyMap;

  add(props: ObjectValue, visitedValues: Set<Value> | void): ObjectValue {
    if (!visitedValues) visitedValues = new Set();
    let currentMap = this.reactPropsRoot;
    let result;

    for (let [propName] of props.properties) {
      currentMap = this._getKey(propName, currentMap, visitedValues);
      let prop = this._getEquivalentPropertyValue(props, propName);
      result = this._getValue(prop, currentMap, visitedValues);
      currentMap = result.map;
    }

    if (result === undefined) {
      if (props.temporalAlias === undefined) {
        return this.emptyObject;
      }
      return props;
    }
    if (result.value === null) {
      result.value = props;
    }
    invariant(result.value instanceof ObjectValue);
    return result.value;
  }
}
