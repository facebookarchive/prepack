/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import type { Realm } from "../realm.js";
import type { LexicalEnvironment } from "../environment.js";
import type { Reference } from "../environment.js";
import { Environment } from "../singletons.js";
import type { BabelNodeIdentifier } from "@babel/types";

// ECMA262 12.1.6
export default function(
  ast: BabelNodeIdentifier,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): Reference {
  // 1. Return ? ResolveBinding(StringValue of Identifier).
  return Environment.ResolveBinding(realm, ast.name, strictCode, env);
}
