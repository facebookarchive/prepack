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
import { hardModifyReactObjectPropertyBinding, isReactElement, isReactProps, getProperty } from "./utils";
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
  }
  realm: Realm;
  objectRoot: ReactSetKeyMap;
  arrayRoot: ReactSetKeyMap;
  residualReactElementVisitor: ResidualReactElementVisitor;

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
    let temporalAlias = object.temporalAlias;

    if (temporalAlias !== undefined) {
      currentMap = this._getKey("temporalAlias", currentMap, visitedValues);
      result = this._getValue(temporalAlias, currentMap, visitedValues);
    }

    if (result === undefined) {
      if (temporalAlias === undefined && this.realm.react.emptyObject !== undefined) {
        return this.realm.react.emptyObject;
      }
      return object;
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
      if (this.realm.react.emptyArray !== undefined) {
        return this.realm.react.emptyArray;
      }
      return array;
    }
    if (result.value === null) {
      result.value = array;
    }
    return result.value;
  }

  _getEquivalentPropertyValue(object: ObjectValue, propName: string): Value {
    let prop = getProperty(this.realm, object, propName);
    let isFinal = object.mightBeFinalObject();
    let equivalentProp;

    if (prop instanceof ObjectValue && isReactElement(prop)) {
      equivalentProp = this.residualReactElementVisitor.reactElementEquivalenceSet.add(prop);

      if (prop !== equivalentProp && isFinal) {
        hardModifyReactObjectPropertyBinding(this.realm, object, propName, equivalentProp);
      }
    } else if (prop instanceof ObjectValue && isReactProps(prop)) {
      equivalentProp = this.residualReactElementVisitor.reactPropsEquivalenceSet.add(prop);

      if (prop !== equivalentProp && isFinal) {
        hardModifyReactObjectPropertyBinding(this.realm, object, propName, equivalentProp);
      }
    } else if (prop instanceof AbstractValue) {
      equivalentProp = this.residualReactElementVisitor.residualHeapVisitor.equivalenceSet.add(prop);

      if (prop !== equivalentProp && isFinal) {
        hardModifyReactObjectPropertyBinding(this.realm, object, propName, equivalentProp);
      }
    }
    return equivalentProp || prop;
  }
}
