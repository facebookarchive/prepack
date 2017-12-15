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
  Value,
  NumberValue,
  ObjectValue,
  SymbolValue,
  FunctionValue,
  StringValue,
  ArrayValue,
  BooleanValue,
  AbstractValue,
} from "../values/index.js";
import { Get } from "../methods/index.js";
import invariant from "../invariant.js";
import { isReactElement } from "./utils.js";
import { ResidualHeapVisitor } from "../serializer/ResidualHeapVisitor.js";

// a nested object of a React Element should be hoisted where all its properties are known
// at evaluation time to be safe to hoist (because of the heuristics of a React render)
function canHoistObject(realm: Realm, object: ObjectValue, residualHeapVisitor: ResidualHeapVisitor): boolean {
  if (isReactElement(object)) {
    return canHoistReactElement(realm, object, residualHeapVisitor);
  }
  for (let [propName] of object.properties) {
    let prop = Get(realm, object, propName);
    if (!canHoistValue(realm, prop, residualHeapVisitor)) {
      return false;
    }
  }
  for (let [symbol] of object.symbols) {
    let prop = Get(realm, object, symbol);
    if (!canHoistValue(realm, prop, residualHeapVisitor)) {
      return false;
    }
  }
  return true;
}

function canHoistArray(realm: Realm, array: ArrayValue, residualHeapVisitor: ResidualHeapVisitor): boolean {
  let lengthValue = Get(realm, array, "length");
  invariant(lengthValue instanceof NumberValue);
  let length = lengthValue.value;
  for (let i = 0; i < length; i++) {
    let element = Get(realm, array, "" + i);

    if (!canHoistValue(realm, element, residualHeapVisitor)) {
      return false;
    }
  }
  return true;
}

export function canHoistFunction(
  realm: Realm,
  func: FunctionValue,
  residualHeapVisitor?: ResidualHeapVisitor
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
        invariant(value instanceof Value);
        if (!canHoistValue(realm, value, residualHeapVisitor)) {
          return false;
        }
      }
    }
    realm.react.hoistableFunctions.set(func, true);
    return true;
  }
  realm.react.hoistableFunctions.set(func, false);
  return false;
}

function canHoistAbstract(realm: Realm, abstract: AbstractValue, residualHeapVisitor: ResidualHeapVisitor): boolean {
  // get the scopes for this abstract value
  let scopes = residualHeapVisitor.values.get(abstract);
  // we can safely hoist abstracts that are created in the common scope
  if (scopes !== undefined) {
    for (let scope of scopes) {
      if (scope === residualHeapVisitor.commonScope) {
        return true;
      }
    }
  }
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

function canHoistValue(realm: Realm, value: Value, residualHeapVisitor: ResidualHeapVisitor): boolean {
  if (
    (value instanceof ArrayValue && canHoistArray(realm, value, residualHeapVisitor)) ||
    (value instanceof FunctionValue && canHoistFunction(realm, value, residualHeapVisitor)) ||
    (value instanceof ObjectValue && canHoistObject(realm, value, residualHeapVisitor)) ||
    (value instanceof AbstractValue && canHoistAbstract(realm, value, residualHeapVisitor)) ||
    isPrimitive(realm, value)
  ) {
    return true;
  }
  return false;
}

export function canHoistReactElement(
  realm: Realm,
  reactElement: ObjectValue,
  residualHeapVisitor?: ResidualHeapVisitor
): boolean {
  if (realm.react.hoistableReactElements.has(reactElement)) {
    // cast because Flow thinks that we may have set a value to be something other than a boolean?
    return ((realm.react.hoistableReactElements.get(reactElement): any): boolean);
  }
  if (residualHeapVisitor === undefined) {
    return false;
  }
  let type = Get(realm, reactElement, "type");
  let ref = Get(realm, reactElement, "ref");
  let key = Get(realm, reactElement, "key");
  let props = Get(realm, reactElement, "props");

  if (
    canHoistValue(realm, type, residualHeapVisitor) &&
    // we can't hoist string "refs" or if they're abstract, as they might be abstract strings
    !(ref instanceof String || ref instanceof AbstractValue) &&
    canHoistValue(realm, ref, residualHeapVisitor) &&
    canHoistValue(realm, key, residualHeapVisitor) &&
    canHoistValue(realm, props, residualHeapVisitor)
  ) {
    realm.react.hoistableReactElements.set(reactElement, true);
    return true;
  }
  realm.react.hoistableReactElements.set(reactElement, false);
  return false;
}
