/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */
type JSONValue = Array<JSONValue> | string | number | JSON;
type JSON = { [key: string]: JSONValue };

// this will mutate the original JSON object
export function mergeAdjacentJSONTextNodes(node: JSON, removeFunctions: boolean, visitedNodes?: Set<JSON>): JSONValue {
  if (visitedNodes === undefined) {
    visitedNodes = new Set();
  }
  if (visitedNodes.has(node)) {
    return node;
  }
  visitedNodes.add(node);

  // we merge adjacent text nodes
  if (Array.isArray(node)) {
    // we create a new array rather than mutating the original
    let arr = [];
    let length = node.length;
    let concatString = null;
    let i = -1;
    while (i++ < length) {
      let child = node[i];
      if (typeof child === "string" || typeof child === "number") {
        if (concatString !== null) {
          concatString += child;
        } else {
          concatString = child;
        }
      } else if (typeof child === "object" && child !== null) {
        if (concatString !== null && concatString !== "") {
          arr.push(concatString);
          concatString = null;
        }
        arr.push(((mergeAdjacentJSONTextNodes(child, removeFunctions, visitedNodes): any): JSON));
      }
    }
    if (concatString !== null && concatString !== "") {
      arr.push(concatString);
    }
    return arr;
  } else {
    for (let key in node) {
      let value = node[key];
      if (typeof value === "function") {
        if (removeFunctions) {
          delete node[key];
        } else {
          node[key] = "function";
        }
      } else if (typeof value === "object" && value !== null) {
        node[key] = ((mergeAdjacentJSONTextNodes(((value: any): JSON), removeFunctions, visitedNodes): any): JSON);
      }
    }
  }
  return node;
}
