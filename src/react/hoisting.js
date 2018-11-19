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
  BooleanValue,
  ECMAScriptSourceFunctionValue,
  FunctionValue,
  NumberValue,
  ObjectValue,
  SymbolValue,
  StringValue,
  Value,
} from "../values/index.js";
import { Get } from "../methods/index.js";
import invariant from "../invariant.js";
import { isReactElement, getProperty } from "./utils.js";
import { ResidualHeapVisitor } from "../serializer/ResidualHeapVisitor.js";

// a nested object of a React Element should be hoisted where all its properties are known
// at evaluation time to be safe to hoist (because of the heuristics of a React render)
function canHoistObject(
  realm: Realm,
  object: ObjectValue,
  residualHeapVisitor: ResidualHeapVisitor,
  visitedValues: Set<Value>
): boolean {
  if (isReactElement(object)) {
    return canHoistReactElement(realm, object, residualHeapVisitor, visitedValues);
  }
  for (let [propName] of object.properties) {
    let prop = Get(realm, object, propName);
    if (!canHoistValue(realm, prop, residualHeapVisitor, visitedValues)) {
      return false;
    }
  }
  for (let [symbol] of object.symbols) {
    let prop = Get(realm, object, symbol);
    if (!canHoistValue(realm, prop, residualHeapVisitor, visitedValues)) {
      return false;
    }
  }
  return true;
}

function canHoistArray(
  realm: Realm,
  array: ArrayValue,
  residualHeapVisitor: ResidualHeapVisitor,
  visitedValues: Set<Value>
): boolean {
  if (array.intrinsicName) return false;
  let lengthValue = Get(realm, array, "length");
  if (!canHoistValue(realm, lengthValue, residualHeapVisitor, visitedValues)) {
    return false;
  }
  if (lengthValue instanceof NumberValue) {
    let length = lengthValue.value;
    for (let i = 0; i < length; i++) {
      let element = Get(realm, array, "" + i);

      if (!canHoistValue(realm, element, residualHeapVisitor, visitedValues)) {
        return false;
      }
    }
  }
  return true;
}

export function canHoistFunction(
  realm: Realm,
  func: FunctionValue,
  residualHeapVisitor?: ResidualHeapVisitor,
  visitedValues: Set<Value>
): boolean {
  if (realm.react.hoistableFunctions.has(func)) {
    // cast because Flow thinks that we may have set a value to be something other than a boolean?
    return ((realm.react.hoistableFunctions.get(func): any): boolean);
  }
  if (residualHeapVisitor === undefined) {
    return false;
  }
  // get the function instance
  let functionInstance = residualHeapVisitor.functionInstances.get(func);
  // we can safely hoist the function if the residual bindings hoistable too
  if (functionInstance !== undefined) {
    invariant(functionInstance.residualFunctionBindings instanceof Map);
    let residualBindings = functionInstance.residualFunctionBindings;
    for (let [, { declarativeEnvironmentRecord, value }] of residualBindings) {
      // if declarativeEnvironmentRecord is null, it's likely a global binding
      // so we can assume that we can still hoist this function
      if (declarativeEnvironmentRecord !== null) {
        if (value === undefined) {
          return false;
        }
        invariant(value instanceof Value);
        if (!canHoistValue(realm, value, residualHeapVisitor, visitedValues)) {
          return false;
        }
      }
    }
    if (func instanceof ECMAScriptSourceFunctionValue) {
      let code = func.$ECMAScriptCode;
      let functionInfos = residualHeapVisitor.functionInfos.get(code);
      if (functionInfos && functionInfos.unbound.size > 0) {
        return false;
      }
    }
    realm.react.hoistableFunctions.set(func, true);
    return true;
  }
  realm.react.hoistableFunctions.set(func, false);
  return false;
}

function canHoistAbstract(realm: Realm, abstract: AbstractValue, residualHeapVisitor: ResidualHeapVisitor): boolean {
  // TODO #1687: add abstract value hoisting
  return false;
}

function isPrimitive(realm: Realm, value: Value) {
  return (
    value instanceof StringValue ||
    value instanceof NumberValue ||
    value instanceof SymbolValue ||
    value instanceof BooleanValue ||
    value === realm.intrinsics.null ||
    value === realm.intrinsics.undefined
  );
}

function canHoistValue(
  realm: Realm,
  value: Value,
  residualHeapVisitor: ResidualHeapVisitor,
  visitedValues: Set<Value>
): boolean {
  if (visitedValues.has(value)) {
    // If there is a cycle, bail out.
    // TODO: is there some way to *not* bail out in this case?
    // Currently if we don't, the output is broken.
    return false;
  }
  visitedValues.add(value);
  let canHoist = false;

  if (value instanceof ArrayValue) {
    canHoist = canHoistArray(realm, value, residualHeapVisitor, visitedValues);
  } else if (value instanceof FunctionValue) {
    canHoist = canHoistFunction(realm, value, residualHeapVisitor, visitedValues);
  } else if (value instanceof ObjectValue) {
    canHoist = canHoistObject(realm, value, residualHeapVisitor, visitedValues);
  } else if (value instanceof AbstractValue) {
    canHoist = canHoistAbstract(realm, value, residualHeapVisitor);
  } else if (isPrimitive) {
    canHoist = true;
  }
  visitedValues.delete(value);
  return canHoist;
}

export function canHoistReactElement(
  realm: Realm,
  reactElement: ObjectValue,
  residualHeapVisitor?: ResidualHeapVisitor,
  visitedValues?: Set<Value> | void
): boolean {
  if (realm.react.hoistableReactElements.has(reactElement)) {
    // cast because Flow thinks that we may have set a value to be something other than a boolean?
    return ((realm.react.hoistableReactElements.get(reactElement): any): boolean);
  }
  if (residualHeapVisitor === undefined) {
    return false;
  }
  let type = getProperty(realm, reactElement, "type");
  let ref = getProperty(realm, reactElement, "ref");
  let key = getProperty(realm, reactElement, "key");
  let props = getProperty(realm, reactElement, "props");

  if (visitedValues === undefined) {
    visitedValues = new Set();
    visitedValues.add(reactElement);
  }
  if (
    canHoistValue(realm, type, residualHeapVisitor, visitedValues) &&
    // we can't hoist string "refs" or if they're abstract, as they might be abstract strings
    !(ref instanceof String || ref instanceof AbstractValue) &&
    canHoistValue(realm, ref, residualHeapVisitor, visitedValues) &&
    canHoistValue(realm, key, residualHeapVisitor, visitedValues) &&
    !props.isPartialObject() &&
    canHoistValue(realm, props, residualHeapVisitor, visitedValues)
  ) {
    realm.react.hoistableReactElements.set(reactElement, true);
    return true;
  }
  realm.react.hoistableReactElements.set(reactElement, false);
  return false;
}

export function determineIfReactElementCanBeHoisted(
  realm: Realm,
  reactElement: ObjectValue,
  residualHeapVisitor: ResidualHeapVisitor
): void {
  canHoistReactElement(realm, reactElement, residualHeapVisitor);
}
