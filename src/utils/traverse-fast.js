/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { BabelNode } from "@babel/types";
import * as t from "@babel/types";

// This is a variation of traverseFast from
// https://github.com/babel/babel/blob/28ae47a174f67a8ae6f4527e0a66e88896814170/packages/babel-types/src/index.js
// This version...
// - takes a callback function that returns a boolean to indicate whether to short-circuit the traversal
// - doesn't pass around or allocate an optional parameter value to the callback.
export default function traverse(node: BabelNode, enter: BabelNode => boolean) {
  if (!node) return;

  let keys = t.VISITOR_KEYS[node.type];
  if (!keys) return;

  let stop = enter(node);
  if (stop) return;

  for (let key of keys) {
    let subNode = (node: any)[key];

    if (Array.isArray(subNode)) {
      for (let elementNode of subNode) {
        traverse(elementNode, enter);
      }
    } else {
      traverse(subNode, enter);
    }
  }
}
