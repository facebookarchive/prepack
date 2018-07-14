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
import type { Value } from "../values/index.js";
import { StringValue } from "../values/index.js";
import { Environment, To } from "../singletons.js";
import type { BabelNodeTemplateLiteral } from "@babel/types";

// ECMA262 12.2.9
export default function(
  ast: BabelNodeTemplateLiteral,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): Value {
  let str = "";

  for (let i = 0; i < ast.quasis.length; i++) {
    // add quasi
    let elem = ast.quasis[i];
    str += elem.value.cooked;

    // add expression
    let expr = ast.expressions[i];
    if (expr) {
      str += To.ToStringPartial(realm, Environment.GetValue(realm, env.evaluate(expr, strictCode)));
    }
  }

  return new StringValue(realm, str);
}
