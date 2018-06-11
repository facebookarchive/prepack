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
import {
  AbstractObjectValue,
  AbstractValue,
  ArrayValue,
  FunctionValue,
  NumberValue,
  ObjectValue,
  StringValue,
  SymbolValue,
  Value,
} from "../values/index.js";
import invariant from "../invariant.js";
import { isBranchedReactElement, isReactElement, getProperty } from "./utils";
import { HashSet } from "../methods/index.js";

type ReactElementValueMapKey = Value | number | string;
type ReactElementValueMap = Map<ReactElementValueMapKey, ReactElementNode>;

type ReactElementKeyMapKey = string | number | SymbolValue;
type ReactElementKeyMap = Map<ReactElementKeyMapKey, ReactElementValueMap>;

type ReactElementNode = {
  map: ReactElementKeyMap,
  value: ObjectValue | ArrayValue | null,
};

// ReactElementSet keeps records around of the values
// of ReactElement/JSX nodes so we can return the same immutable values
// where possible, i.e. <div /> === <div />
//
// Rather than uses hashes, this class uses linked Maps to track equality of objects.
// It does this by recursively iterating through objects, by their properties/symbols and using
// each property key as a map, and then from that map, each value as a map. The value
// then links to the subsequent property/symbol in the object. This approach ensures insertion
// is maintained through all objects.

export default class ReactElementSet {
  constructor(realm: Realm, equivalenceSet: HashSet<AbstractValue>) {
    this.realm = realm;
    this.equivalenceSet = equivalenceSet;
    this.reactElementRoot = new Map();
    this.objectRoot = new Map();
    this.arrayRoot = new Map();
    this.emptyArray = new ArrayValue(realm);
    this.emptyObject = new ObjectValue(realm, realm.intrinsics.ObjectPrototype);
  }
  realm: Realm;
  reactElementRoot: ReactElementKeyMap;
  objectRoot: ReactElementKeyMap;
  arrayRoot: ReactElementKeyMap;
  equivalenceSet: HashSet<AbstractValue>;
  emptyArray: ArrayValue;
  emptyObject: ObjectValue;

  _createNode(): ReactElementNode {
    return {
      map: new Map(),
      value: null,
    };
  }

  _getKey(key: ReactElementKeyMapKey, map: ReactElementKeyMap, visitedValues: Set<Value>): ReactElementValueMap {
    if (!map.has(key)) {
      map.set(key, new Map());
    }
    return ((map.get(key): any): ReactElementValueMap);
  }

  _getValue(val: ReactElementValueMapKey, map: ReactElementValueMap, visitedValues: Set<Value>): ReactElementNode {
    if (val instanceof StringValue || val instanceof NumberValue) {
      val = val.value;
    } else if (val instanceof AbstractObjectValue && isBranchedReactElement(val)) {
      let reactElement = this.realm.react.branchedReactElements.get(val);
      invariant(reactElement !== undefined);
      val = this._getObjectValue(reactElement, visitedValues);
    } else if (val instanceof AbstractValue) {
      val = this.equivalenceSet.add(val);
    } else if (val instanceof ArrayValue) {
      val = this._getArrayValue(val, visitedValues);
    } else if (val instanceof ObjectValue && !(val instanceof FunctionValue)) {
      val = this._getObjectValue(val, visitedValues);
    }
    if (!map.has(val)) {
      map.set(val, this._createNode());
    }
    return ((map.get(val): any): ReactElementNode);
  }

  // for objects: [key/symbol] -> [key/symbol]... as nodes
  _getObjectValue(object: ObjectValue, visitedValues: Set<Value>): ObjectValue {
    if (visitedValues.has(object)) return object;
    visitedValues.add(object);

    if (isReactElement(object)) {
      return this.add(object);
    }
    let currentMap = this.objectRoot;
    let result;

    for (let [propName] of object.properties) {
      currentMap = this._getKey(propName, currentMap, visitedValues);
      let prop = getProperty(this.realm, object, propName);
      result = this._getValue(prop, currentMap, visitedValues);
      currentMap = result.map;
    }
    for (let [symbol] of object.symbols) {
      currentMap = this._getKey(symbol, currentMap, visitedValues);
      let prop = getProperty(this.realm, object, symbol);
      result = this._getValue(prop, currentMap, visitedValues);
      currentMap = result.map;
    }
    if (result === undefined) {
      return this.emptyObject;
    }
    if (result.value === null) {
      result.value = object;
    }
    return result.value;
  }

  // for arrays: [0] -> [1] -> [2]... as nodes
  _getArrayValue(array: ArrayValue, visitedValues: Set<Value>): ArrayValue {
    if (visitedValues.has(array)) return array;
    if (array.intrinsicName) return array;
    visitedValues.add(array);
    let lengthValue = getProperty(this.realm, array, "length");
    invariant(lengthValue instanceof NumberValue);
    let length = lengthValue.value;
    let currentMap = this.arrayRoot;
    let result;

    for (let i = 0; i < length; i++) {
      currentMap = this._getKey(i, currentMap, visitedValues);
      let element = getProperty(this.realm, array, "" + i);
      result = this._getValue(element, currentMap, visitedValues);
      currentMap = result.map;
    }
    if (result === undefined) {
      return this.emptyArray;
    }
    if (result.value === null) {
      result.value = array;
    }
    return result.value;
  }

  add(reactElement: ObjectValue, visitedValues: Set<Value> | void): ObjectValue {
    if (!visitedValues) visitedValues = new Set();
    let currentMap = this.reactElementRoot;

    // type
    currentMap = this._getKey("type", currentMap, visitedValues);
    let type = getProperty(this.realm, reactElement, "type");
    let result = this._getValue(type, currentMap, visitedValues);
    currentMap = result.map;
    // key
    currentMap = this._getKey("key", currentMap, visitedValues);
    let key = getProperty(this.realm, reactElement, "key");
    result = this._getValue(key, currentMap, visitedValues);
    currentMap = result.map;
    // ref
    currentMap = this._getKey("ref", currentMap, visitedValues);
    let ref = getProperty(this.realm, reactElement, "ref");
    result = this._getValue(ref, currentMap, visitedValues);
    currentMap = result.map;
    // props
    currentMap = this._getKey("props", currentMap, visitedValues);
    let props = getProperty(this.realm, reactElement, "props");
    result = this._getValue(props, currentMap, visitedValues);
    currentMap = result.map;

    if (result.value === null) {
      result.value = reactElement;
    }
    invariant(result.value instanceof ObjectValue);
    return result.value;
  }
}
