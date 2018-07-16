/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type {
  BabelBinaryOperator,
  BabelNodeAssignmentExpression,
  BabelNodeExpression,
  BabelNodeStatement,
} from "@babel/types";
import type { LexicalEnvironment } from "../environment.js";
import type { Realm } from "../realm.js";

import { computeBinary } from "../evaluators/BinaryExpression.js";
import { createAbstractValueForBinary } from "../partial-evaluators/BinaryExpression.js";
import { AbruptCompletion, Completion } from "../completions.js";
import { Reference } from "../environment.js";
import { FatalError } from "../errors.js";
import { BooleanValue, ConcreteValue, NullValue, ObjectValue, UndefinedValue, Value } from "../values/index.js";
import { IsAnonymousFunctionDefinition, IsIdentifierRef, HasOwnProperty } from "../methods/index.js";
import { Environment, Functions, Join, Properties } from "../singletons.js";

import * as t from "@babel/types";
import invariant from "../invariant.js";

// ECMA262 12.15 Assignment Operators
export default function(
  ast: BabelNodeAssignmentExpression,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): [Completion | Value, BabelNodeExpression, Array<BabelNodeStatement>] {
  let LeftHandSideExpression = ast.left;
  let AssignmentExpression = ast.right;
  let AssignmentOperator = ast.operator;

  // AssignmentExpression : LeftHandSideExpression = AssignmentExpression
  if (AssignmentOperator === "=") {
    // 1. If LeftHandSideExpression is neither an ObjectLiteral nor an ArrayLiteral, then
    if (LeftHandSideExpression.type !== "ObjectLiteral" && LeftHandSideExpression.type !== "ArrayLiteral") {
      // a. Let lref be the result of evaluating LeftHandSideExpression.
      let [lref, last, lio] = env.partiallyEvaluateCompletion(LeftHandSideExpression, strictCode);

      // b. ReturnIfAbrupt(lref).
      if (lref instanceof AbruptCompletion) return [lref, (last: any), lio];
      let leftCompletion;
      [leftCompletion, lref] = Join.unbundleNormalCompletion(lref);

      // c. Let rref be the result of evaluating AssignmentExpression.
      // d. Let rval be ? GetValue(rref).
      let [rval, rast, rio] = env.partiallyEvaluateCompletionDeref(AssignmentExpression, strictCode);
      let io = lio.concat(rio);
      if (rval instanceof AbruptCompletion) {
        return [rval, t.assignmentExpression(ast.operator, (last: any), (rast: any)), io];
      }
      let rightCompletion;
      [rightCompletion, rval] = Join.unbundleNormalCompletion(rval);
      invariant(rval instanceof Value);

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
      let resultAst = t.assignmentExpression(ast.operator, (last: any), (rast: any));
      rval = Join.composeNormalCompletions(leftCompletion, rightCompletion, rval, realm);
      return [rval, resultAst, io];
    }
    throw new FatalError("Patterns aren't supported yet");
    // 2. Let assignmentPattern be the parse of the source text corresponding to LeftHandSideExpression using AssignmentPattern[?Yield] as the goal symbol.
    // 3. Let rref be the result of evaluating AssignmentExpression.
    // 4. Let rval be ? GetValue(rref).
    // 5. Let status be the result of performing DestructuringAssignmentEvaluation of assignmentPattern using rval as the argument.
    // 6. ReturnIfAbrupt(status).
    // 7. Return rval.
  }

  // AssignmentExpression : LeftHandSideExpression AssignmentOperator AssignmentExpression

  // 1. Let lref be the result of evaluating LeftHandSideExpression.
  let [lref, last, lio] = env.partiallyEvaluateCompletion(LeftHandSideExpression, strictCode);
  if (lref instanceof AbruptCompletion) return [lref, (last: any), lio];
  let leftCompletion;
  [leftCompletion, lref] = Join.unbundleNormalCompletion(lref);

  // 2. Let lval be ? GetValue(lref).
  let lval = Environment.GetValue(realm, lref);

  // 3. Let rref be the result of evaluating AssignmentExpression.
  // 4. Let rval be ? GetValue(rref).
  let [rval, rast, rio] = env.partiallyEvaluateCompletionDeref(AssignmentExpression, strictCode);
  let io = lio.concat(rio);
  if (rval instanceof AbruptCompletion) {
    return [rval, t.assignmentExpression(ast.operator, (last: any), (rast: any)), io];
  }
  let rightCompletion;
  [rightCompletion, rval] = Join.unbundleNormalCompletion(rval);
  invariant(rval instanceof Value);

  // 5. Let op be the @ where AssignmentOperator is @=.
  let op = ((AssignmentOperator.slice(0, -1): any): BabelBinaryOperator);

  // 6. Let r be the result of applying op to lval and rval as if evaluating the expression lval op rval.
  let resultValue, resultAst;
  if (lval instanceof ConcreteValue) {
    if (rval instanceof ConcreteValue) {
      resultValue = computeBinary(realm, op, lval, rval);
      resultAst = t.assignmentExpression(ast.operator, (last: any), t.valueToNode(resultValue.serialize()));
    }
  }
  // if resultValue is undefined, one or both operands are abstract.
  if (resultValue === undefined && (op === "==" || op === "===" || op === "!=" || op === "!==")) {
    // When comparing to null or undefined, we can return a compile time value if we know the
    // other operand must be an object.
    if (
      (!lval.mightNotBeObject() && (rval instanceof NullValue || rval instanceof UndefinedValue)) ||
      (!rval.mightNotBeObject() && (lval instanceof NullValue || lval instanceof UndefinedValue))
    ) {
      resultValue = new BooleanValue(realm, op[0] !== "=");
      resultAst = t.assignmentExpression(ast.operator, (last: any), t.valueToNode(resultValue.serialize()));
    }
  }
  // todo: special case if one result is known to be 0 or 1
  if (resultAst === undefined) {
    resultAst = t.assignmentExpression(ast.operator, (last: any), (rast: any));
  }
  return createAbstractValueForBinary(
    op,
    resultAst,
    lval,
    rval,
    last.loc,
    rast.loc,
    leftCompletion,
    rightCompletion,
    resultValue,
    io,
    realm
  );
}
