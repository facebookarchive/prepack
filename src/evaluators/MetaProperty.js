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
import { GetNewTarget } from "../methods/get.js";
import type { BabelNodeMetaProperty } from "babel-types";

// ECMA 12.3.8.1
export default function (ast: BabelNodeMetaProperty, strictCode: boolean, env: LexicalEnvironment, realm: Realm): Value | Reference {
   return GetNewTarget(realm);
}
