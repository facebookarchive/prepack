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
import { ResolveThisBinding } from "../methods/index.js";
import type { BabelNodeThisExpression } from "babel-types";

// ECMA262 12.2.2.1
export default function (ast: BabelNodeThisExpression, strictCode: boolean, env: LexicalEnvironment, realm: Realm): Value | Reference {
  // 1. Return ? ResolveThisBinding( ).
  return ResolveThisBinding(realm);
}
