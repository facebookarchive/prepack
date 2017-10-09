/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { BabelNode } from "babel-types";
import { BabelTraversePath } from "babel-traverse";

class FunctionalComponent {
  name: string;
  ast: BabelNode;
  type: null;
  defaultPropsObjectExpression: null;

  constructor(name: string, ast: BabelNode, path: BabelTraversePath) {
    this.name = name;
    this.ast = ast;
    this.type = null;
    this.defaultPropsObjectExpression = null;
  }
}

export default FunctionalComponent;
