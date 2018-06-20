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
import { isReactElement, isReactProps, getProperty } from "./utils";
import { Properties } from "../singletons.js";
import { ResidualReactElementVisitor } from "../serializer/ResidualReactElementVisitor.js";

export type ReactSetValueMapKey = Value | number | string;
export type ReactSetValueMap = Map<ReactSetValueMapKey, ReactSetNode>;

export type ReactSetKeyMapKey = string | number | SymbolValue;
export type ReactSetKeyMap = Map<ReactSetKeyMapKey, ReactSetValueMap>;

export type ReactSetNode = {
  map: ReactSetKeyMap,
  value: ObjectValue | ArrayValue | null,
};

// ReactSet keeps records around of the values
// of ReactElement/JSX nodes so we can return the same immutable values
// where possible, i.e. <div /> === <div />
//
// Rather than uses hashes, this class uses linked Maps to track equality of objects.
// It does this by recursively iterating through objects, by their properties/symbols and using
// each property key as a map, and then from that map, each value as a map. The value
// then links to the subsequent property/symbol in the object. This approach ensures insertion
// is maintained through all objects.

export class ReactSet {
  constructor(realm: Realm, residualReactElementVisitor: ResidualReactElementVisitor) {
    this.realm = realm;
    this.residualReactElementVisitor = residualReactElementVisitor;
    this.objectRoot = new Map();
    this.arrayRoot = new Map();
    this.emptyArray = new ArrayValue(realm);
    this.emptyObject = new ObjectValue(realm, realm.intrinsics.ObjectPrototype);
  }
  realm: Realm;
  objectRoot: ReactSetKeyMap;
  arrayRoot: ReactSetKeyMap;
  residualReactElementVisitor: ResidualReactElementVisitor;
  emptyArray: ArrayValue;
  emptyObject: ObjectValue;

  _createNode(): ReactSetNode {
    return {
      map: new Map(),
      value: null,
    };
  }

  _getKey(key: ReactSetKeyMapKey, map: ReactSetKeyMap, visitedValues: Set<Value>): ReactSetValueMap {
    if (!map.has(key)) {
      map.set(key, new Map());
    }
    return ((map.get(key): any): ReactSetValueMap);
  }

  _getValue(val: ReactSetValueMapKey, map: ReactSetValueMap, visitedValues: Set<Value>): ReactSetNode {
    if (val instanceof StringValue || val instanceof NumberValue) {
      val = val.value;
    } else if (val instanceof AbstractValue) {
      val = this.residualReactElementVisitor.residualHeapVisitor.equivalenceSet.add(val);
    } else if (val instanceof ArrayValue) {
      val = this._getArrayValue(val, visitedValues);
    } else if (val instanceof ObjectValue && !(val instanceof FunctionValue)) {
      val = this._getObjectValue(val, visitedValues);
    }
    if (!map.has(val)) {
      map.set(val, this._createNode());
    }
    return ((map.get(val): any): ReactSetNode);
  }

  // for objects: [key/symbol] -> [key/symbol]... as nodes
  _getObjectValue(object: ObjectValue, visitedValues: Set<Value>): ObjectValue {
    if (visitedValues.has(object)) return object;
    visitedValues.add(object);

    if (isReactElement(object)) {
      return this.residualReactElementVisitor.reactElementEquivalenceSet.add(object);
    }
    let currentMap = this.objectRoot;
    let result;

    for (let [propName] of object.properties) {
      currentMap = this._getKey(propName, currentMap, visitedValues);
      let prop = this._getEquivalentPropertyValue(object, propName);
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
      if (object.temporalAlias === undefined) {
        return object;
      }
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
      let element = this._getEquivalentPropertyValue(array, "" + i);
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

  _getEquivalentPropertyValue(object: ObjectValue, propName: string): Value {
    let prop = getProperty(this.realm, object, propName);
    let isFinalObject = object.mightBeFinalObject();
    let isHavoedObject = object.mightBeHavocedObject();
    let equivalentProp;

    // We can unhavoc and make not final here because we're in the visitor/serialization
    // stage and we're dealing with objects that React created and we know are immutable
    if (isHavoedObject) {
      object.unhavoc();
    }
    if (isFinalObject) {
      object.makeNotFinal();
    }
    if (prop instanceof ObjectValue && isReactElement(prop)) {
      equivalentProp = this.residualReactElementVisitor.reactElementEquivalenceSet.add(prop);

      if (prop !== equivalentProp) {
        Properties.Set(this.realm, object, propName, equivalentProp, true);
      }
    } else if (prop instanceof ObjectValue && isReactProps(prop)) {
      equivalentProp = this.residualReactElementVisitor.reactPropsEquivalenceSet.add(prop);

      if (prop !== equivalentProp) {
        Properties.Set(this.realm, object, propName, equivalentProp, true);
      }
    } else if (prop instanceof AbstractValue) {
      equivalentProp = this.residualReactElementVisitor.residualHeapVisitor.equivalenceSet.add(prop);

      if (prop !== equivalentProp) {
        Properties.Set(this.realm, object, propName, equivalentProp, true);
      }
    }
    if (isFinalObject) {
      object.makeFinal();
    }
    if (isHavoedObject) {
      object.havoc();
    }
    return equivalentProp || prop;
  }
}
