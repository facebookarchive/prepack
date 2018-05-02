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
import { CompilerDiagnostic, FatalError } from "../errors.js";
import { Add } from "../methods/index.js";
import { AbstractValue, NumberValue, IntegralValue } from "../values/index.js";
import type { BabelNodeUpdateExpression } from "babel-types";
import { Environment, Havoc, Properties, To } from "../singletons.js";
import invariant from "../invariant.js";
import * as t from "babel-types";

export default function(
  ast: BabelNodeUpdateExpression,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): Value {
  // ECMA262 12.4 Update Expressions

  // Let expr be the result of evaluating UnaryExpression.
  let expr = env.evaluate(ast.argument, strictCode);

  // Let oldValue be ? ToNumber(? GetValue(expr)).
  let oldExpr = Environment.GetValue(realm, expr);
  if (oldExpr instanceof AbstractValue) {
    if (!To.IsToNumberPure(realm, oldExpr)) {
      if (realm.isInPureScope()) {
        let value = AbstractValue.createTemporalFromBuildFunction(realm, NumberValue, [oldExpr], ([valNode]) =>
          t.updateExpression(ast.operator, valNode, ast.prefix)
        );
        Havoc.value(oldExpr);
        if (ast.prefix) {
          return value;
        } else {
          return oldExpr;
        }
      }
      let error = new CompilerDiagnostic(
        "might be a symbol or an object with an unknown valueOf or toString or Symbol.toPrimitive method",
        ast.argument.loc,
        "PP0008",
        "RecoverableError"
      );
      if (realm.handleError(error) === "Fail") throw new FatalError();
    }
    invariant(ast.operator === "++" || ast.operator === "--"); // As per BabelNodeUpdateExpression
    let op = ast.operator === "++" ? "+" : "-";
    let newAbstractValue = AbstractValue.createFromBinaryOp(realm, op, oldExpr, new NumberValue(realm, 1), ast.loc);
    Properties.PutValue(realm, expr, newAbstractValue);
    if (ast.prefix) {
      return newAbstractValue;
    } else {
      return oldExpr;
    }
  }
  let oldValue = To.ToNumber(realm, oldExpr);

  if (ast.prefix) {
    if (ast.operator === "++") {
      // ECMA262 12.4.6.1

      // 3. Let newValue be the result of adding the value 1 to oldValue, using the same rules as for the + operator (see 12.8.5)
      let newValue = Add(realm, oldValue, 1);

      // 4. Perform ? PutValue(expr, newValue).
      Properties.PutValue(realm, expr, newValue);

      // 5. Return newValue.
      return newValue;
    } else if (ast.operator === "--") {
      // ECMA262 12.4.7.1

      // 3. Let newValue be the result of subtracting the value 1 from oldValue, using the same rules as for the - operator (see 12.8.5).
      let newValue = Add(realm, oldValue, -1);

      // 4. Perform ? PutValue(expr, newValue).
      Properties.PutValue(realm, expr, newValue);

      // 5. Return newValue.
      return newValue;
    }
    invariant(false);
  } else {
    if (ast.operator === "++") {
      // ECMA262 12.4.4.1

      // 3. Let newValue be the result of adding the value 1 to oldValue, using the same rules as for the + operator (see 12.8.5).
      let newValue = Add(realm, oldValue, 1);

      // 4. Perform ? PutValue(lhs, newValue).
      Properties.PutValue(realm, expr, newValue);

      // 5. Return oldValue.
      return IntegralValue.createFromNumberValue(realm, oldValue);
    } else if (ast.operator === "--") {
      // ECMA262 12.4.5.1

      // 3. Let newValue be the result of subtracting the value 1 from oldValue, using the same rules as for the - operator (see 12.8.5).
      let newValue = Add(realm, oldValue, -1);

      // 4. Perform ? PutValue(lhs, newValue).
      Properties.PutValue(realm, expr, newValue);

      // 5. Return oldValue.
      return IntegralValue.createFromNumberValue(realm, oldValue);
    }
    invariant(false);
  }
}
