/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import type { BabelNodeRegExpLiteral, BabelNodeStatement } from "@babel/types";
import type { LexicalEnvironment } from "../environment.js";
import type { Realm } from "../realm.js";

import { RegExpCreate } from "../methods/index.js";
import { ObjectValue, StringValue } from "../values/index.js";

export default function(
  ast: BabelNodeRegExpLiteral,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): [ObjectValue, BabelNodeRegExpLiteral, Array<BabelNodeStatement>] {
  let result = RegExpCreate(
    realm,
    new StringValue(realm, ast.pattern),
    ast.flags ? new StringValue(realm, ast.flags) : undefined
  );
  return [result, ast, []];
}
