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
  BabelNodeBinaryExpression,
  BabelNodeExpression,
  BabelNodeStatement,
  BabelNodeSourceLocation,
} from "@babel/types";
import type { LexicalEnvironment } from "../environment.js";
import type { Realm } from "../realm.js";

import { computeBinary, getPureBinaryOperationResultType } from "../evaluators/BinaryExpression.js";
import { AbruptCompletion, Completion, NormalCompletion } from "../completions.js";
import { FatalError } from "../errors.js";
import { Join } from "../singletons.js";
import { AbstractValue, BooleanValue, ConcreteValue, NullValue, UndefinedValue, Value } from "../values/index.js";

import * as t from "@babel/types";
import invariant from "../invariant.js";

export default function(
  ast: BabelNodeBinaryExpression,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): [Completion | Value, BabelNodeExpression, Array<BabelNodeStatement>] {
  let [lval, leftAst, leftIO] = env.partiallyEvaluateCompletionDeref(ast.left, strictCode);
  if (lval instanceof AbruptCompletion) return [lval, (leftAst: any), leftIO];
  let leftCompletion;
  [leftCompletion, lval] = Join.unbundleNormalCompletion(lval);
  invariant(lval instanceof Value);

  let [rval, rightAst, rightIO] = env.partiallyEvaluateCompletionDeref(ast.right, strictCode);
  let io = leftIO.concat(rightIO);
  if (rval instanceof AbruptCompletion) {
    // todo: if leftCompletion is a PossiblyNormalCompletion, compose
    return [rval, t.binaryExpression(ast.operator, (leftAst: any), (rightAst: any)), io];
  }
  let rightCompletion;
  [rightCompletion, rval] = Join.unbundleNormalCompletion(rval);
  invariant(rval instanceof Value);

  let op = ast.operator;
  let resultValue, resultAst;
  if (lval instanceof ConcreteValue) {
    if (rval instanceof ConcreteValue) {
      resultValue = computeBinary(realm, op, lval, rval);
      resultAst = t.valueToNode(resultValue.serialize());
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
      resultAst = t.valueToNode(resultValue.serialize());
    }
  }
  // todo: special case if one result is known to be 0 or 1
  if (resultAst === undefined) {
    resultAst = t.binaryExpression(op, (leftAst: any), (rightAst: any));
  }
  return createAbstractValueForBinary(
    op,
    resultAst,
    lval,
    rval,
    leftAst.loc,
    rightAst.loc,
    leftCompletion,
    rightCompletion,
    resultValue,
    io,
    realm
  );
}

export function createAbstractValueForBinary(
  op: BabelBinaryOperator,
  ast: BabelNodeExpression,
  lval: Value,
  rval: Value,
  lloc: ?BabelNodeSourceLocation,
  rloc: ?BabelNodeSourceLocation,
  leftCompletion: void | NormalCompletion,
  rightCompletion: void | NormalCompletion,
  resultValue: void | Value,
  io: Array<BabelNodeStatement>,
  realm: Realm
): [Completion | Value, BabelNodeExpression, Array<BabelNodeStatement>] {
  if (resultValue === undefined) {
    let resultType = getPureBinaryOperationResultType(realm, op, lval, rval, lloc, rloc);
    if (resultType === undefined) {
      // The operation may result in side effects that we cannot track.
      // Since we have no idea what those effects are, we can either forget
      // (havoc) everything we know at this stage, or we can fault the
      // program and/or native model and stop evaluating.
      // We choose to do the latter.
      // TODO: report the error and carry on assuming no side effects.
      let val = lval instanceof AbstractValue ? lval : rval;
      AbstractValue.reportIntrospectionError((val: any));
      throw new FatalError();
    }
    resultValue = AbstractValue.createFromBinaryOp(realm, op, lval, rval, ast.loc);
  }
  let r = Join.composeNormalCompletions(leftCompletion, rightCompletion, resultValue, realm);
  return [r, ast, io];
}
