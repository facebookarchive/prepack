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
import { HashSet } from "../methods/index.js";

type ReactSetValueMapKey = Value | number | string;
type ReactSetValueMap = Map<ReactSetValueMapKey, ReactSetNode>;

type ReactSetKeyMapKey = string | number | SymbolValue;
export type ReactSetKeyMap = Map<ReactSetKeyMapKey, ReactSetValueMap>;

export type ReactSetNode = {
  map: ReactSetKeyMap,
  value: ObjectValue | ArrayValue | null,
};

function createNode(): ReactSetNode {
  return {
    map: new Map(),
    value: null,
  };
}

function getKey(key: ReactSetKeyMapKey, map: ReactSetKeyMap, visitedValues: Set<Value>): ReactSetValueMap {
  if (!map.has(key)) {
    map.set(key, new Map());
  }
  return ((map.get(key): any): ReactSetValueMap);
}

function getValue(
  realm: Realm,
  val: ReactSetValueMapKey,
  map: ReactSetValueMap,
  abstractEquivalenceSet: HashSet<AbstractValue>,
  reactElementRoot: ReactSetKeyMap,
  reactPropsRoot: ReactSetKeyMap,
  objectRoot: ReactSetKeyMap,
  arrayRoot: ReactSetKeyMap,
  visitedValues: Set<Value>
): ReactSetNode {
  if (val instanceof StringValue || val instanceof NumberValue) {
    val = val.value;
  } else if (val instanceof AbstractValue) {
    val = abstractEquivalenceSet.add(val);
  } else if (val instanceof ArrayValue) {
    val = getArrayValue(
      realm,
      val,
      abstractEquivalenceSet,
      reactElementRoot,
      reactPropsRoot,
      objectRoot,
      arrayRoot,
      visitedValues
    );
  } else if (val instanceof ObjectValue && !(val instanceof FunctionValue)) {
    val = getObjectValue(
      realm,
      val,
      abstractEquivalenceSet,
      reactElementRoot,
      reactPropsRoot,
      objectRoot,
      arrayRoot,
      visitedValues
    );
  }
  if (!map.has(val)) {
    map.set(val, createNode());
  }
  return ((map.get(val): any): ReactSetNode);
}

// for objects: [key/symbol] -> [key/symbol]... as nodes
function getObjectValue(
  realm: Realm,
  object: ObjectValue,
  abstractEquivalenceSet: HashSet<AbstractValue>,
  reactElementRoot: ReactSetKeyMap,
  reactPropsRoot: ReactSetKeyMap,
  objectRoot: ReactSetKeyMap,
  arrayRoot: ReactSetKeyMap,
  visitedValues: Set<Value>
): ObjectValue {
  if (visitedValues.has(object)) return object;
  visitedValues.add(object);

  if (isReactElement(object)) {
    return addReactElement(
      realm,
      object,
      abstractEquivalenceSet,
      reactElementRoot,
      reactPropsRoot,
      objectRoot,
      arrayRoot,
      visitedValues
    );
  }
  let currentMap = objectRoot;
  let result;

  for (let [propName] of object.properties) {
    currentMap = getKey(propName, currentMap, visitedValues);
    let prop = getEquivalentPropertyValue(
      realm,
      object,
      propName,
      abstractEquivalenceSet,
      reactElementRoot,
      reactPropsRoot,
      objectRoot,
      arrayRoot,
      visitedValues
    );
    result = getValue(
      realm,
      prop,
      currentMap,
      abstractEquivalenceSet,
      reactElementRoot,
      reactPropsRoot,
      objectRoot,
      arrayRoot,
      visitedValues
    );
    currentMap = result.map;
  }
  for (let [symbol] of object.symbols) {
    currentMap = getKey(symbol, currentMap, visitedValues);
    let prop = getProperty(realm, object, symbol);
    result = getValue(
      realm,
      prop,
      currentMap,
      abstractEquivalenceSet,
      reactElementRoot,
      reactPropsRoot,
      objectRoot,
      arrayRoot,
      visitedValues
    );
    currentMap = result.map;
  }
  let temporalAlias = object.temporalAlias;

  if (temporalAlias !== undefined) {
    // Snapshotting uses temporalAlias to on ObjectValues, so if
    // they have a temporalAlias then we need to treat it as a field
    currentMap = getKey("__$$__temporalAlias", currentMap, visitedValues);
    result = getValue(
      realm,
      temporalAlias,
      currentMap,
      abstractEquivalenceSet,
      reactElementRoot,
      reactPropsRoot,
      objectRoot,
      arrayRoot,
      visitedValues
    );
  }

  if (result === undefined) {
    // If we have a temporalAlias, we can never return an empty object
    if (temporalAlias === undefined && realm.react.emptyObject !== undefined) {
      return realm.react.emptyObject;
    }
    return object;
  }
  if (result.value === null) {
    result.value = object;
  }
  return result.value;
}

// for arrays: [0] -> [1] -> [2]... as nodes
function getArrayValue(
  realm: Realm,
  array: ArrayValue,
  abstractEquivalenceSet: HashSet<AbstractValue>,
  reactElementRoot: ReactSetKeyMap,
  reactPropsRoot: ReactSetKeyMap,
  objectRoot: ReactSetKeyMap,
  arrayRoot: ReactSetKeyMap,
  visitedValues: Set<Value>
): ArrayValue {
  if (visitedValues.has(array)) return array;
  if (array.intrinsicName) return array;
  visitedValues.add(array);
  let lengthValue = getProperty(realm, array, "length");
  invariant(lengthValue instanceof NumberValue);
  let length = lengthValue.value;
  let currentMap = arrayRoot;
  let result;

  for (let i = 0; i < length; i++) {
    currentMap = getKey(i, currentMap, visitedValues);
    let element = getEquivalentPropertyValue(
      realm,
      array,
      "" + i,
      abstractEquivalenceSet,
      reactElementRoot,
      reactPropsRoot,
      objectRoot,
      arrayRoot,
      visitedValues
    );
    result = getValue(
      realm,
      element,
      currentMap,
      abstractEquivalenceSet,
      reactElementRoot,
      reactPropsRoot,
      objectRoot,
      arrayRoot,
      visitedValues
    );
    currentMap = result.map;
  }
  if (result === undefined) {
    if (realm.react.emptyArray !== undefined) {
      return realm.react.emptyArray;
    }
    return array;
  }
  if (result.value === null) {
    result.value = array;
  }
  return result.value;
}

function getEquivalentPropertyValue(
  realm: Realm,
  object: ObjectValue,
  propName: string,
  abstractEquivalenceSet: HashSet<AbstractValue>,
  reactElementRoot: ReactSetKeyMap,
  reactPropsRoot: ReactSetKeyMap,
  objectRoot: ReactSetKeyMap,
  arrayRoot: ReactSetKeyMap,
  visitedValues: Set<Value>
): Value {
  let prop = getProperty(realm, object, propName);
  let isFinal = object.mightBeFinalObject();
  let equivalentProp;

  if (prop instanceof ObjectValue && isReactElement(prop)) {
    equivalentProp = addReactElement(
      realm,
      prop,
      abstractEquivalenceSet,
      reactElementRoot,
      reactPropsRoot,
      objectRoot,
      arrayRoot,
      visitedValues
    );

    if (prop !== equivalentProp && isFinal) {
      hardModifyReactObjectPropertyBinding(realm, object, propName, equivalentProp);
    }
  } else if (prop instanceof ObjectValue && isReactProps(prop)) {
    equivalentProp = addReactProps(
      realm,
      prop,
      abstractEquivalenceSet,
      reactElementRoot,
      reactPropsRoot,
      objectRoot,
      arrayRoot,
      visitedValues
    );

    if (prop !== equivalentProp && isFinal) {
      hardModifyReactObjectPropertyBinding(realm, object, propName, equivalentProp);
    }
  } else if (prop instanceof AbstractValue) {
    equivalentProp = abstractEquivalenceSet.add(prop);

    if (prop !== equivalentProp && isFinal) {
      hardModifyReactObjectPropertyBinding(realm, object, propName, equivalentProp);
    }
  }
  return equivalentProp || prop;
}

// This logic in this module is for the equivalence of ReactElement and props.
// ReactElement/JSX/props nodes are all immutable values and we can try and match
// them where possible because of these heuristics, i.e. <div /> === <div />
//
// Rather than uses hashes, this class uses linked Maps to track equality of objects.
// It does this by recursively iterating through objects, by their properties/symbols and using
// each property key as a map, and then from that map, each value as a map. The value
// then links to the subsequent property/symbol in the object. This approach ensures insertion
// is maintained through all objects.

export function addReactElement(
  realm: Realm,
  reactElement: ObjectValue,
  abstractEquivalenceSet: HashSet<AbstractValue>,
  reactElementRoot: ReactSetKeyMap,
  reactPropsRoot: ReactSetKeyMap,
  objectRoot: ReactSetKeyMap,
  arrayRoot: ReactSetKeyMap,
  visitedValues?: Set<Value> = new Set()
): ObjectValue {
  let currentMap = reactElementRoot;

  // type
  currentMap = getKey("type", currentMap, visitedValues);
  let type = getEquivalentPropertyValue(
    realm,
    reactElement,
    "type",
    abstractEquivalenceSet,
    reactElementRoot,
    reactPropsRoot,
    objectRoot,
    arrayRoot,
    visitedValues
  );
  let result = getValue(
    realm,
    type,
    currentMap,
    abstractEquivalenceSet,
    reactElementRoot,
    reactPropsRoot,
    objectRoot,
    arrayRoot,
    visitedValues
  );
  currentMap = result.map;
  // key
  currentMap = getKey("key", currentMap, visitedValues);
  let key = getEquivalentPropertyValue(
    realm,
    reactElement,
    "key",
    abstractEquivalenceSet,
    reactElementRoot,
    reactPropsRoot,
    objectRoot,
    arrayRoot,
    visitedValues
  );
  result = getValue(
    realm,
    key,
    currentMap,
    abstractEquivalenceSet,
    reactElementRoot,
    reactPropsRoot,
    objectRoot,
    arrayRoot,
    visitedValues
  );
  currentMap = result.map;
  // ref
  currentMap = getKey("ref", currentMap, visitedValues);
  let ref = getEquivalentPropertyValue(
    realm,
    reactElement,
    "ref",
    abstractEquivalenceSet,
    reactElementRoot,
    reactPropsRoot,
    objectRoot,
    arrayRoot,
    visitedValues
  );
  result = getValue(
    realm,
    ref,
    currentMap,
    abstractEquivalenceSet,
    reactElementRoot,
    reactPropsRoot,
    objectRoot,
    arrayRoot,
    visitedValues
  );
  currentMap = result.map;
  // props
  currentMap = getKey("props", currentMap, visitedValues);
  let props = getEquivalentPropertyValue(
    realm,
    reactElement,
    "props",
    abstractEquivalenceSet,
    reactElementRoot,
    reactPropsRoot,
    objectRoot,
    arrayRoot,
    visitedValues
  );
  result = getValue(
    realm,
    props,
    currentMap,
    abstractEquivalenceSet,
    reactElementRoot,
    reactPropsRoot,
    objectRoot,
    arrayRoot,
    visitedValues
  );

  if (result.value === null) {
    result.value = reactElement;
  }
  invariant(result.value instanceof ObjectValue);
  return result.value;
}

export function addReactProps(
  realm: Realm,
  props: ObjectValue,
  abstractEquivalenceSet: HashSet<AbstractValue>,
  reactElementRoot: ReactSetKeyMap,
  reactPropsRoot: ReactSetKeyMap,
  objectRoot: ReactSetKeyMap,
  arrayRoot: ReactSetKeyMap,
  visitedValues?: Set<Value> = new Set()
): ObjectValue {
  let currentMap = reactPropsRoot;
  let result;

  for (let [propName] of props.properties) {
    currentMap = getKey(propName, currentMap, visitedValues);
    let prop = getEquivalentPropertyValue(
      realm,
      props,
      propName,
      abstractEquivalenceSet,
      reactElementRoot,
      reactPropsRoot,
      objectRoot,
      arrayRoot,
      visitedValues
    );
    result = getValue(
      realm,
      prop,
      currentMap,
      abstractEquivalenceSet,
      reactElementRoot,
      reactPropsRoot,
      objectRoot,
      arrayRoot,
      visitedValues
    );
    currentMap = result.map;
  }
  let temporalAlias = props.temporalAlias;

  if (temporalAlias !== undefined) {
    // Snapshotting uses temporalAlias to on ObjectValues, so if
    // they have a temporalAlias then we need to treat it as a field
    currentMap = getKey("__$$__temporalAlias", currentMap, visitedValues);
    result = getValue(
      realm,
      temporalAlias,
      currentMap,
      abstractEquivalenceSet,
      reactElementRoot,
      reactPropsRoot,
      objectRoot,
      arrayRoot,
      visitedValues
    );
  }

  if (result === undefined) {
    // If we have a temporalAlias, we can never return an empty object
    if (temporalAlias === undefined && realm.react.emptyObject !== undefined) {
      return realm.react.emptyObject;
    }
    return props;
  }
  if (result.value === null) {
    result.value = props;
  }
  invariant(result.value instanceof ObjectValue);
  return result.value;
}
