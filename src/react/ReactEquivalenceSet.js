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
import { hardModifyReactObjectPropertyBinding, isReactElement, isReactPropsObject, getProperty } from "./utils.js";
import { ResidualReactElementVisitor } from "../serializer/ResidualReactElementVisitor.js";

export type ReactSetValueMapKey = Value | number | string;
export type ReactSetValueMap = Map<ReactSetValueMapKey, ReactSetNode>;

export type ReactSetKeyMapKey = string | number | Symbol | SymbolValue;
export type ReactSetKeyMap = Map<ReactSetKeyMapKey, ReactSetValueMap>;

export type ReactSetNode = {
  map: ReactSetKeyMap,
  value: ObjectValue | ArrayValue | null,
};

export const temporalAliasSymbol = Symbol("temporalAlias");

// ReactEquivalenceSet keeps records around of the values
// of ReactElement/JSX nodes so we can return the same immutable values
// where possible, i.e. <div /> === <div />
//
// Rather than uses hashes, this class uses linked Maps to track equality of objects.
// It does this by recursively iterating through objects, by their properties/symbols and using
// each property key as a map, and then from that map, each value as a map. The value
// then links to the subsequent property/symbol in the object. This approach ensures insertion
// is maintained through all objects.
export class ReactEquivalenceSet {
  constructor(realm: Realm, residualReactElementVisitor: ResidualReactElementVisitor) {
    this.realm = realm;
    this.residualReactElementVisitor = residualReactElementVisitor;
    this.objectRoot = new Map();
    this.arrayRoot = new Map();
    this.reactElementRoot = new Map();
    this.reactPropsRoot = new Map();
    this.temporalAliasRoot = new Map();
  }
  realm: Realm;
  objectRoot: ReactSetKeyMap;
  arrayRoot: ReactSetKeyMap;
  reactElementRoot: ReactSetKeyMap;
  reactPropsRoot: ReactSetKeyMap;
  temporalAliasRoot: ReactSetKeyMap;
  residualReactElementVisitor: ResidualReactElementVisitor;

  _createNode(): ReactSetNode {
    return {
      map: new Map(),
      value: null,
    };
  }

  getKey(key: ReactSetKeyMapKey, map: ReactSetKeyMap, visitedValues: Set<Value>): ReactSetValueMap {
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
      currentMap = this.getKey(propName, currentMap, visitedValues);
      result = this.getEquivalentPropertyValue(object, propName, currentMap, visitedValues);
      currentMap = result.map;
    }
    for (let [symbol] of object.symbols) {
      currentMap = this.getKey(symbol, currentMap, visitedValues);
      let prop = getProperty(this.realm, object, symbol);
      result = this._getValue(prop, currentMap, visitedValues);
      currentMap = result.map;
    }
    let temporalAlias = object.temporalAlias;

    if (temporalAlias !== undefined) {
      currentMap = this.getKey(temporalAliasSymbol, currentMap, visitedValues);
      result = this.getTemporalAliasValue(temporalAlias, currentMap, visitedValues);
    }

    if (result === undefined) {
      // If we have a temporalAlias, we can never return an empty object
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

  _getTemporalValue(temporalAlias: AbstractObjectValue, visitedValues: Set<Value>): AbstractObjectValue {
    // Check to ensure the temporal alias is definitely declared in the current scope
    if (!this.residualReactElementVisitor.wasTemporalAliasDeclaredInCurrentScope(temporalAlias)) {
      return temporalAlias;
    }
    let temporalOperationEntry = this.realm.getTemporalOperationEntryFromDerivedValue(temporalAlias);

    if (temporalOperationEntry === undefined) {
      return temporalAlias;
    }
    let temporalArgs = temporalOperationEntry.args;
    if (temporalArgs.length === 0) {
      return temporalAlias;
    }
    let currentMap = this.temporalAliasRoot;
    let result;

    for (let i = 0; i < temporalArgs.length; i++) {
      let arg = temporalArgs[i];
      let equivalenceArg;
      if (arg instanceof ObjectValue && arg.temporalAlias === temporalAlias) {
        continue;
      }
      if (arg instanceof ObjectValue && isReactElement(arg)) {
        equivalenceArg = this.residualReactElementVisitor.reactElementEquivalenceSet.add(arg);

        if (arg !== equivalenceArg) {
          temporalArgs[i] = equivalenceArg;
        }
      } else if (arg instanceof AbstractObjectValue && !arg.values.isTop() && arg.kind !== "conditional") {
        // Might be a temporal, so let's check
        let childTemporalOperationEntry = this.realm.getTemporalOperationEntryFromDerivedValue(arg);

        if (childTemporalOperationEntry !== undefined) {
          equivalenceArg = this._getTemporalValue(arg, visitedValues);
          invariant(equivalenceArg instanceof AbstractObjectValue);

          if (equivalenceArg !== arg) {
            temporalArgs[i] = equivalenceArg;
          }
        }
      } else if (arg instanceof AbstractValue) {
        equivalenceArg = this.residualReactElementVisitor.residualHeapVisitor.equivalenceSet.add(arg);

        if (arg !== equivalenceArg) {
          temporalArgs[i] = equivalenceArg;
        }
      }
      currentMap = this.getKey(i, (currentMap: any), visitedValues);
      invariant(arg instanceof Value && (equivalenceArg instanceof Value || equivalenceArg === undefined));
      result = this._getValue(equivalenceArg || arg, currentMap, visitedValues);
      currentMap = result.map;
    }
    invariant(result !== undefined);
    if (result.value === null) {
      result.value = temporalAlias;
    }
    // Check to ensure the equivalent temporal alias is definitely declared in the current scope
    if (!this.residualReactElementVisitor.wasTemporalAliasDeclaredInCurrentScope(result.value)) {
      result.value = temporalAlias;
      return temporalAlias;
    }
    return result.value;
  }

  getTemporalAliasValue(
    temporalAlias: AbstractObjectValue,
    map: ReactSetValueMap,
    visitedValues: Set<Value>
  ): ReactSetNode {
    let result = this._getTemporalValue(temporalAlias, visitedValues);

    invariant(result instanceof AbstractObjectValue);
    if (!map.has(result)) {
      map.set(result, this._createNode());
    }
    return ((map.get(result): any): ReactSetNode);
  }

  // for arrays: [length] -> ([length] is numeric) -> [0] -> [1] -> [2]... as nodes
  _getArrayValue(array: ArrayValue, visitedValues: Set<Value>): ArrayValue {
    if (visitedValues.has(array)) return array;
    if (array.intrinsicName) return array;
    visitedValues.add(array);
    let currentMap = this.arrayRoot;
    currentMap = this.getKey("length", currentMap, visitedValues);
    let result = this.getEquivalentPropertyValue(array, "length", currentMap, visitedValues);
    currentMap = result.map;

    let lengthValue = getProperty(this.realm, array, "length");
    // If we have a numeric lenth that is not abstract, then also check all the array elements
    if (lengthValue instanceof NumberValue) {
      invariant(lengthValue instanceof NumberValue);
      let length = lengthValue.value;

      for (let i = 0; i < length; i++) {
        currentMap = this.getKey(i, currentMap, visitedValues);
        result = this.getEquivalentPropertyValue(array, "" + i, currentMap, visitedValues);
        currentMap = result.map;
      }
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
    invariant(result.value instanceof ArrayValue);
    return result.value;
  }

  getEquivalentPropertyValue(
    object: ObjectValue,
    propName: string,
    map: ReactSetValueMap,
    visitedValues: Set<Value>
  ): ReactSetNode {
    let prop = getProperty(this.realm, object, propName);
    let isFinal = object.mightBeFinalObject();
    let equivalentProp;

    if (prop instanceof ObjectValue && isReactElement(prop)) {
      equivalentProp = this.residualReactElementVisitor.reactElementEquivalenceSet.add(prop);
    } else if (prop instanceof ObjectValue && isReactPropsObject(prop)) {
      equivalentProp = this.residualReactElementVisitor.reactPropsEquivalenceSet.add(prop);
    } else if (prop instanceof AbstractValue) {
      equivalentProp = this.residualReactElementVisitor.residualHeapVisitor.equivalenceSet.add(prop);
    }

    if (equivalentProp !== undefined) {
      if (prop !== equivalentProp && isFinal) {
        hardModifyReactObjectPropertyBinding(this.realm, object, propName, equivalentProp);
      }
      if (!map.has(equivalentProp)) {
        map.set(equivalentProp, this._createNode());
      }
      return ((map.get(equivalentProp): any): ReactSetNode);
    } else {
      return this._getValue(prop, map, visitedValues);
    }
  }
}
