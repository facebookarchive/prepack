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
import { Value, ObjectValue } from "../values/index.js";
import { Reference } from "../environment.js";
import {
  DestructuringAssignmentEvaluation,
  HasOwnProperty,
  IsAnonymousFunctionDefinition,
  IsIdentifierRef,
} from "../methods/index.js";
import { Environment, Functions, Properties } from "../singletons.js";
import invariant from "../invariant.js";
import type { BabelNodeAssignmentExpression, BabelBinaryOperator } from "@babel/types";
import { computeBinary } from "./BinaryExpression.js";

// ECMA262 12.15 Assignment Operators
export default function(
  ast: BabelNodeAssignmentExpression,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): Value {
  if (!ast.hasOwnProperty("operator") || ast.operator === null) throw Error("Unexpected AST form");

  let LeftHandSideExpression = ast.left;
  let AssignmentExpression = ast.right;
  let AssignmentOperator = ast.operator;

  // AssignmentExpression : LeftHandSideExpression = AssignmentExpression
  if (AssignmentOperator === "=") {
    // 1. If LeftHandSideExpression is neither an ObjectLiteral nor an ArrayLiteral, then
    //
    // The spec assumes we haven't yet distinguished between literals and
    // patterns, but our parser does that work for us. That means we check for
    // "*Pattern" instead of "*Literal" like the spec text suggests.
    if (LeftHandSideExpression.type !== "ObjectPattern" && LeftHandSideExpression.type !== "ArrayPattern") {
      // a. Let lref be the result of evaluating LeftHandSideExpression.
      let lref = env.evaluate(LeftHandSideExpression, strictCode);
      // b. ReturnIfAbrupt(lref). -- Not neccessary
      // c. Let rref be the result of evaluating AssignmentExpression.
      let rref = env.evaluate(AssignmentExpression, strictCode);
      // d. Let rval be ? GetValue(rref).
      let rval = Environment.GetValue(realm, rref);
      // e. If IsAnonymousFunctionDefinition(AssignmentExpression) and IsIdentifierRef of LeftHandSideExpression are both true, then
      if (
        IsAnonymousFunctionDefinition(realm, AssignmentExpression) &&
        IsIdentifierRef(realm, LeftHandSideExpression)
      ) {
        invariant(rval instanceof ObjectValue);
        // i. Let hasNameProperty be ? HasOwnProperty(rval, "name").
        let hasNameProperty = HasOwnProperty(realm, rval, "name");
        // ii. If hasNameProperty is false, perform SetFunctionName(rval, GetReferencedName(lref)).
        if (!hasNameProperty) {
          invariant(lref instanceof Reference);
          Functions.SetFunctionName(realm, rval, Environment.GetReferencedName(realm, lref));
        }
      }
      // f. Perform ? PutValue(lref, rval).
      Properties.PutValue(realm, lref, rval);
      // g. Return rval.
      return rval;
    }

    // 2. Let assignmentPattern be the parse of the source text corresponding to LeftHandSideExpression using AssignmentPattern[?Yield] as the goal symbol.
    let assignmentPattern = LeftHandSideExpression;

    // 3. Let rref be the result of evaluating AssignmentExpression.
    let rref = env.evaluate(AssignmentExpression, strictCode);

    // 4. Let rval be ? GetValue(rref).
    let rval = Environment.GetValue(realm, rref);

    // 5. Let status be the result of performing DestructuringAssignmentEvaluation of assignmentPattern using rval as the argument.
    DestructuringAssignmentEvaluation(realm, assignmentPattern, rval, strictCode, env);

    // 6. ReturnIfAbrupt(status).

    // 7. Return rval.
    return rval;
  }

  // AssignmentExpression : LeftHandSideExpression AssignmentOperator AssignmentExpression

  // 1. Let lref be the result of evaluating LeftHandSideExpression.
  let lref = env.evaluate(LeftHandSideExpression, strictCode);
  // 2. Let lval be ? GetValue(lref).
  let lval = Environment.GetValue(realm, lref);
  // 3. Let rref be the result of evaluating AssignmentExpression.
  let rref = env.evaluate(AssignmentExpression, strictCode);
  // 4. Let rval be ? GetValue(rref).
  let rval = Environment.GetValue(realm, rref);
  // 5. Let op be the @ where AssignmentOperator is @=.
  let op = ((AssignmentOperator.slice(0, -1): any): BabelBinaryOperator);
  // 6. Let r be the result of applying op to lval and rval as if evaluating the expression lval op rval.
  let r = Environment.GetValue(realm, computeBinary(realm, op, lval, rval, ast.left.loc, ast.right.loc));
  // 7. Perform ? PutValue(lref, r).
  Properties.PutValue(realm, lref, r);
  // 8. Return r.
  return r;
}
