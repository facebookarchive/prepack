/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { ECMAScriptSourceFunctionValue, FunctionValue, ObjectValue, SymbolValue } from "../values/index.js";
import type { Effects, Realm, SideEffectType } from "../realm.js";

import { FatalError } from "../errors.js";
import type { PropertyBinding, Descriptor } from "../types.js";
import invariant from "../invariant.js";
import { IsArray, IsArrayIndex } from "../methods/index.js";
import { Logger } from "../utils/logger.js";
import { Generator } from "../utils/generator.js";
import type { AdditionalFunctionEffects } from "./types";
import type { Binding } from "../environment.js";
import { getLocationFromValue } from "../react/utils";

/**
 * Get index property list length by searching array properties list for the max index key value plus 1.
 */
export function getSuggestedArrayLiteralLength(realm: Realm, val: ObjectValue): number {
  invariant(IsArray(realm, val));

  let length = 0;
  for (const key of val.properties.keys()) {
    if (IsArrayIndex(realm, key) && Number(key) >= length) {
      length = Number(key) + 1;
    }
  }
  return length;
}

export function commonAncestorOf<T>(node1: void | T, node2: void | T, getParent: T => void | T): void | T {
  if (node1 === node2) return node1;
  // First get the path length to the root node for both nodes while also checking if
  // either node is the parent of the other.
  let n1 = node1,
    n2 = node2,
    count1 = 0,
    count2 = 0;
  while (true) {
    let p1 = n1 && getParent(n1);
    let p2 = n2 && getParent(n2);
    if (p1 === node2) return node2;
    if (p2 === node1) return node1;
    if (p1 !== undefined) count1++;
    if (p2 !== undefined) count2++;
    if (p1 === undefined && p2 === undefined) break;
    n1 = p1;
    n2 = p2;
  }
  // Now shorten the longest path to the same length as the shorter path
  n1 = node1;
  while (count1 > count2) {
    invariant(n1 !== undefined);
    n1 = getParent(n1);
    count1--;
  }
  n2 = node2;
  while (count1 < count2) {
    invariant(n2 !== undefined);
    n2 = getParent(n2);
    count2--;
  }
  // Now run up both paths in tandem, stopping at the first common entry
  while (n1 !== n2) {
    invariant(n1 !== undefined);
    n1 = getParent(n1);
    invariant(n2 !== undefined);
    n2 = getParent(n2);
  }
  return n1;
}

// Gets map[key] with default value provided by defaultFn
export function getOrDefault<K, V>(map: Map<K, V>, key: K, defaultFn: () => V): V {
  let value = map.get(key);
  if (value === undefined) map.set(key, (value = defaultFn()));
  invariant(value !== undefined);
  return value;
}

export function withDescriptorValue(
  propertyNameOrSymbol: string | SymbolValue,
  descriptor: void | Descriptor,
  func: Function
): void {
  if (descriptor !== undefined) {
    if (descriptor.value !== undefined) {
      func(propertyNameOrSymbol, descriptor.value, "value");
    } else {
      if (descriptor.get !== undefined) {
        func(propertyNameOrSymbol, descriptor.get, "get");
      }
      if (descriptor.set !== undefined) {
        func(propertyNameOrSymbol, descriptor.set, "set");
      }
    }
  }
}

export const ClassPropertiesToIgnore: Set<string> = new Set(["arguments", "name", "caller"]);

export function canIgnoreClassLengthProperty(val: ObjectValue, desc: void | Descriptor, logger: Logger): boolean {
  if (desc && desc.value === undefined) {
    logger.logError(val, "Functions with length accessor properties are not supported in residual heap.");
  }
  return true;
}

export function getObjectPrototypeMetadata(
  realm: Realm,
  obj: ObjectValue
): { skipPrototype: boolean, constructor: void | ECMAScriptSourceFunctionValue } {
  let proto = obj.$Prototype;
  let skipPrototype = false;
  let constructor;

  if (obj.$IsClassPrototype) {
    skipPrototype = true;
  }
  if (proto && proto.$IsClassPrototype) {
    invariant(proto instanceof ObjectValue);
    // we now need to check if the prototpe has a constructor
    let _constructor = proto.properties.get("constructor");
    if (_constructor !== undefined) {
      // if the contructor has been deleted then we have no way
      // to serialize the original class AST as it won't have been
      // evluated and thus visited
      if (_constructor.descriptor === undefined) {
        throw new FatalError("TODO #1024: implement object prototype serialization with deleted constructor");
      }
      let classFunc = _constructor.descriptor.value;
      if (classFunc instanceof ECMAScriptSourceFunctionValue) {
        constructor = classFunc;
        skipPrototype = true;
      }
    }
  }

  return {
    skipPrototype,
    constructor,
  };
}

export function createAdditionalEffects(
  realm: Realm,
  effects: Effects,
  fatalOnAbrupt: boolean,
  name: string,
  environmentRecordIdAfterGlobalCode: number,
  parentAdditionalFunction: FunctionValue | void = undefined
): AdditionalFunctionEffects | null {
  let generator = Generator.fromEffects(effects, realm, name, environmentRecordIdAfterGlobalCode);
  let retValue: AdditionalFunctionEffects = {
    parentAdditionalFunction,
    effects,
    transforms: [],
    generator,
    additionalRoots: new Set(),
  };
  return retValue;
}

export function handleReportedSideEffect(
  exceptionHandler: string => void,
  sideEffectType: SideEffectType,
  binding: void | Binding | PropertyBinding,
  expressionLocation: any
): void {
  // This causes an infinite recursion because creating a callstack causes internal-only side effects
  if (binding && binding.object && binding.object.intrinsicName === "__checkedBindings") return;
  let location = getLocationFromValue(expressionLocation);

  if (sideEffectType === "MODIFIED_BINDING") {
    let name = binding ? `"${((binding: any): Binding).name}"` : "unknown";
    exceptionHandler(`side-effects from mutating the binding ${name}${location}`);
  } else if (sideEffectType === "MODIFIED_PROPERTY" || sideEffectType === "MODIFIED_GLOBAL") {
    let name = "";
    let key = ((binding: any): PropertyBinding).key;
    if (typeof key === "string") {
      name = `"${key}"`;
    }
    if (sideEffectType === "MODIFIED_PROPERTY") {
      exceptionHandler(`side-effects from mutating a property ${name}${location}`);
    } else {
      exceptionHandler(`side-effects from mutating the global object property ${name}${location}`);
    }
  } else if (sideEffectType === "EXCEPTION_THROWN") {
    exceptionHandler(`side-effects from throwing exception${location}`);
  }
}
