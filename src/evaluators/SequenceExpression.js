/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { Realm } from "../realm.js";
import type { LexicalEnvironment } from "../environment.js";
import type { Value } from "../values/index.js";
import type { Reference } from "../environment.js";
import { GetValue } from "../methods/index.js";
import type { BabelNodeSequenceExpression } from "babel-types";
import invariant from "../invariant.js";

export default function (ast: BabelNodeSequenceExpression, strictCode: boolean, env: LexicalEnvironment, realm: Realm): Value | Reference {
  invariant(ast.expressions.length > 0);
  let val;
  for (let node of ast.expressions) {
    val = GetValue(realm, env.evaluate(node, strictCode));
  }
  invariant(val !== undefined);
  return val;
}
