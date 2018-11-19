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
import { Value, StringValue } from "../values/index.js";
import { RegExpCreate } from "../methods/index.js";
import type { BabelNodeRegExpLiteral } from "@babel/types";

export default function(
  ast: BabelNodeRegExpLiteral,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): Value {
  return RegExpCreate(
    realm,
    new StringValue(realm, ast.pattern),
    ast.flags !== undefined ? new StringValue(realm, ast.flags) : undefined
  );
}
