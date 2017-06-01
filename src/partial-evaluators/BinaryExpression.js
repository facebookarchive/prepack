/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { BabelNodeBinaryExpression, BabelNodeExpression, BabelNodeStatement } from "babel-types";
import type { LexicalEnvironment } from "../environment.js";
import type { Realm } from "../realm.js";

import { computeBinary, getPureBinaryOperationResultType } from "../evaluators/BinaryExpression.js";
import { AbruptCompletion, Completion, PossiblyNormalCompletion } from "../completions.js";
import { TypesDomain, ValuesDomain } from "../domains/index.js";
import { composePossiblyNormalCompletions, updatePossiblyNormalCompletionWithValue } from "../methods/index.js";
import { AbstractValue, BooleanValue, ConcreteValue, NullValue, UndefinedValue, Value } from "../values/index.js";

import * as t from "babel-types";
import invariant from "../invariant.js";

export default function (
  ast: BabelNodeBinaryExpression, strictCode: boolean, env: LexicalEnvironment, realm: Realm
): [Completion | Value, BabelNodeExpression, Array<BabelNodeStatement>] {
  let [lval, leftAst, leftIO] = env.partiallyEvaluateCompletionDeref(ast.left, strictCode);
  if (lval instanceof AbruptCompletion) return [lval, (leftAst: any), leftIO];
  let leftCompletion;
  if (lval instanceof PossiblyNormalCompletion) {
    leftCompletion = lval;
    lval = leftCompletion.value;
  }
  invariant(lval instanceof Value);

  let [rval, rightAst, rightIO] = env.partiallyEvaluateCompletionDeref(ast.right, strictCode);
  let io = leftIO.concat(rightIO);
  if (rval instanceof AbruptCompletion) {
    return [rval, t.binaryExpression(ast.operator, (leftAst: any), (rightAst: any)), io];
  }
  let rightCompletion;
  if (rval instanceof PossiblyNormalCompletion) {
    rightCompletion = rval;
    rval = rightCompletion.value;
  }
  invariant(rval instanceof Value);

  let op = ast.operator;
  let resultValue, resultAst;
  if (lval instanceof ConcreteValue) {
    if (rval instanceof ConcreteValue) {
      resultValue = computeBinary(realm, op, lval, rval);
      resultAst = t.valueToNode(resultValue.serialize());
    }
  }
  if (resultValue === undefined && (op === "==" || op === "===" || op === "!=" || op === "!==")) {
    if (!lval.mightNotBeObject() && (rval instanceof NullValue || rval instanceof UndefinedValue) ||
        !rval.mightNotBeObject() && (lval instanceof NullValue || lval instanceof UndefinedValue)) {
      resultValue = new BooleanValue(realm, op[0] !== "=");
      resultAst = t.valueToNode(resultValue.serialize());
    }
  }
  // todo: special case if one result is known to be 0 or 1
  if (resultValue === undefined) {
    let resultType = getPureBinaryOperationResultType(realm, op, lval, rval);
    if (resultType === undefined) {
      // The operation may result in side effects that we cannot track.
      // Since we have no idea what those effects are, we can either forget
      // (havoc) everything we know at this stage, or we can fault the
      // program and/or native model and stop evaluating.
      // We choose to do the latter.
      // TODO: report the error and carry on assuming no side effects.
      let val = lval instanceof AbstractValue ? lval : rval;
      return [AbstractValue.createIntrospectionErrorThrowCompletion((val: any)), ast, io];
    }
    resultValue = realm.createAbstract(
      new TypesDomain(resultType), ValuesDomain.topVal, [], t.identifier("never used"));
  }
  if (resultAst === undefined) {
    resultAst = t.binaryExpression(op, (leftAst: any), (rightAst: any));
  }
  if (leftCompletion instanceof PossiblyNormalCompletion) {
    if (rightCompletion instanceof PossiblyNormalCompletion) {
      updatePossiblyNormalCompletionWithValue(realm, rightCompletion, resultValue);
      let completion = composePossiblyNormalCompletions(realm, leftCompletion, rightCompletion);
      return [completion, resultAst, io];
    }
    updatePossiblyNormalCompletionWithValue(realm, leftCompletion, resultValue);
    return [leftCompletion, resultAst, io];
  } else if (rightCompletion instanceof PossiblyNormalCompletion) {
    updatePossiblyNormalCompletionWithValue(realm, rightCompletion, resultValue);
    return [rightCompletion, resultAst, io];
  } else {
    invariant(!leftCompletion && !rightCompletion);
    return [resultValue, resultAst, io];
  }
}
