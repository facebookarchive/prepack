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
import type { BabelNode, BabelNodeJSXIdentifier } from "babel-types";
import {
  Value,
  NumberValue,
  ObjectValue,
  SymbolValue,
  FunctionValue,
  StringValue,
  ArrayValue,
} from "../values/index.js";
import { Generator } from "../utils/generator.js";
import { Get } from "../methods/index.js";
import { computeBinary } from "../evaluators/BinaryExpression.js";
import { type ReactSerializerState } from "../serializer/types.js";
import invariant from "../invariant.js";
import AbstractValue from "../values/AbstractValue";

export function isReactElement(val: Value): boolean {
  if (val instanceof ObjectValue && val.properties.has("$$typeof")) {
    let realm = val.$Realm;
    let $$typeof = Get(realm, val, "$$typeof");
    if ($$typeof instanceof SymbolValue) {
      let symbolFromRegistry = realm.globalSymbolRegistry.find(e => e.$Symbol === $$typeof);
      return symbolFromRegistry !== undefined && symbolFromRegistry.$Key === "react.element";
    }
  }
  return false;
}

export function isTagName(ast: BabelNode): boolean {
  return ast.type === "JSXIdentifier" && /^[a-z]|\-/.test(((ast: any): BabelNodeJSXIdentifier).name);
}

export function isReactComponent(name: string) {
  return name.length > 0 && name[0] === name[0].toUpperCase();
}

export function valueIsClassComponent(realm: Realm, value: Value) {
  if (!(value instanceof FunctionValue)) {
    return false;
  }
  if (value.$Prototype instanceof ObjectValue) {
    let prototype = Get(realm, value.$Prototype, "prototype");
    if (prototype instanceof ObjectValue) {
      return prototype.properties.has("isReactComponent");
    }
  }
  return false;
}

// a nested object of a React Element should be hoisted where all its properties are known
// at evaluation time to be "static" or "pure". This means function values in scope, strings, numbers
// and deeply nested object/arrays that share the same heuristics
function canHoistObject(realm: Realm, object: ObjectValue, hoistedScope?: Generator): boolean {
  if (isReactElement(object)) {
    return canHoistReactElement(realm, object);
  }
  for (let [propName] of object.properties) {
    let prop = Get(realm, object, propName);
    if (prop instanceof AbstractValue) {
      return false;
    } else if (prop instanceof FunctionValue && prop.parent !== hoistedScope) {
      return false;
    } else if (prop instanceof ArrayValue) {
      let isHoistable = canHoistArray(realm, prop, hoistedScope);

      if (!isHoistable) {
        return false;
      }
    } else if (prop instanceof ObjectValue) {
      let isHoistable = canHoistObject(realm, prop, hoistedScope);

      if (!isHoistable) {
        return false;
      }
    }
  }
  return true;
}

function canHoistArray(realm: Realm, array: ArrayValue, hoistedScope?: Generator): boolean {
  let lengthValue = Get(realm, array, "length");
  invariant(lengthValue instanceof NumberValue);
  let length = lengthValue.value;
  for (let i = 0; i < length; i++) {
    let element = Get(realm, array, "" + i);

    if (element instanceof AbstractValue) {
      return false;
    } else if (element instanceof ArrayValue) {
      let isHoistable = canHoistArray(realm, element, hoistedScope);

      if (!isHoistable) {
        return false;
      }
    } else if (element instanceof FunctionValue && element.parent !== hoistedScope) {
      return false;
    } else if (element instanceof ObjectValue) {
      let isHoistable = canHoistObject(realm, element, hoistedScope);

      if (!isHoistable) {
        return false;
      }
    }
  }
  return true;
}

export function canHoistReactElement(realm: Realm, reactElement: ObjectValue, hoistedScope?: Generator): boolean {
  if (reactElement.$CanHoist) {
    return true;
  }
  // we host components <div />, <span /> etc
  // we also allow functions where their parent scope matches the hoisted scope
  let type = Get(realm, reactElement, "type");
  if (!(type instanceof StringValue || (type instanceof FunctionValue && type.parent === hoistedScope))) {
    return false;
  }
  // you can only hoist null or function values where the scope matches the hoisted scope
  let ref = Get(realm, reactElement, "ref");
  if (!(ref === realm.intrinsics.null || (ref instanceof FunctionValue && ref.parent === hoistedScope))) {
    return false;
  }
  // keys should also be string or null
  let key = Get(realm, reactElement, "key");
  if (!(key instanceof StringValue || key === realm.intrinsics.null)) {
    return false;
  }
  let props = Get(realm, reactElement, "props");
  invariant(props instanceof ObjectValue);
  let isHoistable = canHoistObject(realm, props, hoistedScope);
  if (!isHoistable) {
    return false;
  }
  // cache the value so we can avoid doing this work again
  reactElement.$CanHoist = true;
  return true;
}

export function addKeyToReactElement(
  realm: Realm,
  reactSerializerState: ReactSerializerState,
  reactElement: ObjectValue
): void {
  // we need to apply a key when we're branched
  let currentKeyValue = Get(realm, reactElement, "key") || realm.intrinsics.null;
  let uniqueKey = getUniqueReactElementKey("", reactSerializerState.usedReactElementKeys);
  let newKeyValue = new StringValue(realm, uniqueKey);
  if (currentKeyValue !== realm.intrinsics.null) {
    newKeyValue = computeBinary(realm, "+", currentKeyValue, newKeyValue);
  }
  // TODO: This might not be safe in DEV because these objects are frozen (Object.freeze).
  // We should probably go behind the scenes in this case to by-pass that.
  reactElement.$Set("key", newKeyValue, reactElement);
}
// we create a unique key for each JSXElement to prevent collisions
// otherwise React will detect a missing/conflicting key at runtime and
// this can break the reconcilation of JSXElements in arrays
export function getUniqueReactElementKey(index?: string, usedReactElementKeys: Set<string>) {
  let key;
  do {
    key = Math.random().toString(36).replace(/[^a-z]+/g, "").substring(0, 2);
  } while (usedReactElementKeys.has(key));
  usedReactElementKeys.add(key);
  if (index !== undefined) {
    return `${key}${index}`;
  }
  return key;
}

// a helper function to map over ArrayValues
export function mapOverArrayValue(realm: Realm, array: ArrayValue, mapFunc: Function): void {
  let lengthValue = Get(realm, array, "length");
  invariant(lengthValue instanceof NumberValue, "Invalid length on ArrayValue during reconcilation");
  let length = lengthValue.value;
  for (let i = 0; i < length; i++) {
    let elementProperty = array.properties.get("" + i);
    let elementPropertyDescriptor = elementProperty && elementProperty.descriptor;
    invariant(elementPropertyDescriptor, `Invalid ArrayValue[${i}] descriptor`);
    let elementValue = elementPropertyDescriptor.value;
    if (elementValue instanceof Value) {
      mapFunc(elementValue, elementPropertyDescriptor);
    }
  }
}
