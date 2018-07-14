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
import { ReactEquivalenceSet, temporalAliasSymbol } from "./ReactEquivalenceSet.js";

export class ReactPropsSet {
  constructor(realm: Realm, reactEquivalenceSet: ReactEquivalenceSet) {
    this.realm = realm;
    this.reactEquivalenceSet = reactEquivalenceSet;
  }
  realm: Realm;
  reactEquivalenceSet: ReactEquivalenceSet;

  add(props: ObjectValue, visitedValues: Set<Value> | void): ObjectValue {
    if (!visitedValues) visitedValues = new Set();
    let reactEquivalenceSet = this.reactEquivalenceSet;
    let currentMap = reactEquivalenceSet.reactPropsRoot;
    let result;

    for (let [propName] of props.properties) {
      currentMap = reactEquivalenceSet.getKey(propName, currentMap, visitedValues);
      result = reactEquivalenceSet.getEquivalentPropertyValue(props, propName, currentMap, visitedValues);
      currentMap = result.map;
    }
    let temporalAlias = props.temporalAlias;

    if (temporalAlias !== undefined) {
      currentMap = reactEquivalenceSet.getKey(temporalAliasSymbol, currentMap, visitedValues);
      result = reactEquivalenceSet.getTemporalAliasValue(temporalAlias, currentMap, visitedValues);
      currentMap = result.map;
    }

    if (result === undefined) {
      // If we have a temporalAlias, we can never return an empty object
      if (temporalAlias === undefined && this.realm.react.emptyObject !== undefined) {
        return this.realm.react.emptyObject;
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
