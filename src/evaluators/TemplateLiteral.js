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
import { StringValue } from "../values/index.js";
import { ToStringPartial } from "../methods/index.js";
import { GetValue } from "../methods/environment.js";
import type { BabelNodeTemplateLiteral } from "babel-types";

// ECMA262 12.2.9
export default function (ast: BabelNodeTemplateLiteral, strictCode: boolean, env: LexicalEnvironment, realm: Realm): Value | Reference {
  let str = "";

  for (let i = 0; i < ast.quasis.length; i++) {
    // add quasi
    let elem = ast.quasis[i];
    str += elem.value.cooked;

    // add expression
    let expr = ast.expressions[i];
    if (expr) {
      str += ToStringPartial(realm, GetValue(realm, env.evaluate(expr, strictCode)));
    }
  }

  return new StringValue(realm, str);
}
