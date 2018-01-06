/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { ObjectValue, SymbolValue } from "../values/index.js";
import type { Realm } from "../realm.js";

import type { Descriptor } from "../types.js";
import invariant from "../invariant.js";
import { IsArray, IsArrayIndex } from "../methods/index.js";
import { Logger } from "./logger.js";

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

interface HasParent { getParent(): void | HasParent }

export function commonAncestorOf<T: HasParent>(node1: void | T, node2: void | T): void | T {
  if (node1 === node2) return node1;
  // First get the path length to the root node for both nodes while also checking if
  // either node is the parent of the other.
  let n1 = node1,
    n2 = node2,
    count1 = 0,
    count2 = 0;
  while (true) {
    let p1 = n1 && n1.getParent();
    let p2 = n2 && n2.getParent();
    if (p1 === node2) return node2;
    if (p2 === node1) return node1;
    if (p1) count1++;
    if (p2) count2++;
    if (!p1 && !p2) break;
    n1 = p1;
    n2 = p2;
  }
  // Now shorten the longest path to the same length as the shorter path
  n1 = node1;
  while (count1 > count2) {
    invariant(n1 !== undefined);
    n1 = n1.getParent();
    count1--;
  }
  n2 = node2;
  while (count1 < count2) {
    invariant(n2 !== undefined);
    n2 = n2.getParent();
    count2--;
  }
  // Now run up both paths in tandem, stopping at the first common entry
  while (n1 !== n2) {
    invariant(n1 !== undefined);
    n1 = n1.getParent();
    invariant(n2 !== undefined);
    n2 = n2.getParent();
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

export function canIgnoreClassLengthProperty(val: ObjectValue, desc: Descriptor, logger: Logger) {
  if (desc.value === undefined) {
    logger.logError(val, "Functions with length accessor properties are not supported in residual heap.");
  }
  return true;
}
