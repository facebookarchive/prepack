/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { BabelNodeNullLiteral } from "babel-types";
import type { LexicalEnvironment } from "../environment.js";
import type { NullValue } from "../values/index.js";
import type { Realm } from "../realm.js";

export default function (
  ast: BabelNodeNullLiteral, strictCode: boolean, env: LexicalEnvironment, realm: Realm
): [NullValue, BabelNodeNullLiteral] {
  let result = realm.intrinsics.null;
  return [result, ast];
}
