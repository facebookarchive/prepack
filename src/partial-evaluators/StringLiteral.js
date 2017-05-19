/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { BabelNodeStringLiteral } from "babel-types";
import type { LexicalEnvironment } from "../environment.js";
import type { Realm } from "../realm.js";

import { StringValue } from "../values/index.js";

export default function (
  ast: BabelNodeStringLiteral, strictCode: boolean, env: LexicalEnvironment, realm: Realm
): [StringValue, BabelNodeStringLiteral] {
  let result = new StringValue(realm, ast.value);
  return [result, ast];
}
