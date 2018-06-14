/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import invariant from "../invariant.js";

// JSON.stringify is not the right choice when writing out giant objects
// to disk. This is an alternative that produces a stream of tokens incrementally
// instead of building a giant in-memory representation first.
// The exported function returns a function that, when called repeatedly,
// provides all the strings that when concatenated together produce the
// result JSON.stringified would have produced on the data.
// After all strings have been provided, the final answer will be undefined.
export default (data: any): (() => void | string) => {
  // $FlowFixMe: "symbol" not yet supported by Flow
  let isLegal = x => x !== undefined && typeof x !== "function" && typeof x !== "symbol";
  invariant(isLegal(data));
  let pushData = (stack, x) => stack.push(typeof x === "object" && x !== null ? x : JSON.stringify(x));
  let stack = [];
  pushData(stack, data);
  let visited = new Set();
  return () => {
    while (stack.length > 0) {
      data = stack.pop();
      if (typeof data === "string") return data;
      invariant(typeof data === "object" && data !== null);
      if (visited.has(data)) throw new TypeError("Converting circular structure to JSON");
      visited.add(data);
      if (Array.isArray(data)) {
        stack.push("]");
        for (let i = data.length - 1; i >= 0; i--) {
          let value = data[i];
          pushData(stack, isLegal(value) ? value : null);
          if (i > 0) stack.push(",");
        }
        stack.push("[");
      } else {
        stack.push("}");
        let reversedStack = [];
        for (let key in data) {
          // $FlowFixMe: "symbol" not yet supported by Flow
          if (typeof key === "symbol") continue;
          let value = data[key];
          if (!isLegal(value)) continue;
          if (reversedStack.length > 0) reversedStack.push(",");
          reversedStack.push(JSON.stringify(key));
          reversedStack.push(":");
          pushData(reversedStack, value);
        }
        stack.push(...reversedStack.reverse());
        stack.push("{");
      }
    }
  };
};
