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
import { Add, GetValue, ToNumber, PutValue } from "../methods/index.js";
import { NumberValue } from "../values/index.js";
import type { BabelNodeUpdateExpression } from "babel-types";

export default function (ast: BabelNodeUpdateExpression, strictCode: boolean, env: LexicalEnvironment, realm: Realm): Value | Reference {
  // ECMA262 12.4 Update Expressions

  // Let expr be the result of evaluating UnaryExpression.
  let expr = env.evaluate(ast.argument, strictCode);

  // Let oldValue be ? ToNumber(? GetValue(expr)).
  let oldExpr = GetValue(realm, expr).throwIfNotConcrete();
  let oldValue = ToNumber(realm, oldExpr);

  if (ast.prefix) {
    if (ast.operator === "++") {
      // ECMA262 12.4.6.1

      // 3. Let newValue be the result of adding the value 1 to oldValue, using the same rules as for the + operator (see 12.8.5)
      let newValue = Add(realm, oldValue, 1);

      // 4. Perform ? PutValue(expr, newValue).
      PutValue(realm, expr, newValue);

      // 5. Return newValue.
      return newValue;
    } else if (ast.operator === "--") {
      // ECMA262 12.4.7.1

      // 3. Let newValue be the result of subtracting the value 1 from oldValue, using the same rules as for the - operator (see 12.8.5).
      let newValue = Add(realm, oldValue, -1);

      // 4. Perform ? PutValue(expr, newValue).
      PutValue(realm, expr, newValue);

      // 5. Return newValue.
      return newValue;
    }
  } else {
    if (ast.operator === "++") {
      // ECMA262 12.4.4.1

      // 3. Let newValue be the result of adding the value 1 to oldValue, using the same rules as for the + operator (see 12.8.5).
      let newValue = Add(realm, oldValue, 1);

      // 4. Perform ? PutValue(lhs, newValue).
      PutValue(realm, expr, newValue);

      // 5. Return oldValue.
      return new NumberValue(realm, oldValue);
    } else if (ast.operator === "--") {
      // ECMA262 12.4.5.1

      // 3. Let newValue be the result of subtracting the value 1 from oldValue, using the same rules as for the - operator (see 12.8.5).
      let newValue = Add(realm, oldValue, -1);

      // 4. Perform ? PutValue(lhs, newValue).
      PutValue(realm, expr, newValue);

      // 5. Return oldValue.
      return new NumberValue(realm, oldValue);
    }
  }

  throw new Error("unimplemented");
}
