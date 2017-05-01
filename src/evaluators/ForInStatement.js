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
import type { LexicalEnvironment, Reference } from "../environment.js";
import { BreakCompletion } from "../completions.js";
import { TypesDomain, ValuesDomain } from "../domains/index.js";
import { DeclarativeEnvironmentRecord } from "../environment.js";
import { ForInOfHeadEvaluation, ForInOfBodyEvaluation } from "./ForOfStatement.js";
import { BoundNames, NewDeclarativeEnvironment, UpdateEmpty } from "../methods/index.js";
import { AbstractValue, AbstractObjectValue, ObjectValue, StringValue, UndefinedValue, Value } from "../values/index.js";
import type { BabelNodeForInStatement, BabelNodeStatement, BabelNodeVariableDeclaration } from "babel-types";
import invariant from "../invariant.js";
import * as t from "babel-types";

// ECMA262 13.7.5.11
export default function (ast: BabelNodeForInStatement, strictCode: boolean, env: LexicalEnvironment, realm: Realm, labelSet: ?Array<string>): Value | Reference {
  let { left, right, body } = ast;

  try {
    if (left.type === "VariableDeclaration") {
      if (left.kind === "var") { // for (var ForBinding in Expression) Statement
        // 1. Let keyResult be ? ForIn/OfHeadEvaluation(« », Expression, enumerate).
        let keyResult = ForInOfHeadEvaluation(realm, env, [], right, "enumerate", strictCode);

        if (keyResult instanceof AbstractObjectValue) {
          return emitResidualLoopIfSafe(ast, strictCode, env, realm, left, keyResult, body);
        }

        // 2. Return ? ForIn/OfBodyEvaluation(ForBinding, Statement, keyResult, varBinding, labelSet).
        return ForInOfBodyEvaluation(realm, env, left.declarations[0].id, body, keyResult, "varBinding", labelSet, strictCode);
      } else { // for (ForDeclaration in Expression) Statement
        // 1. Let keyResult be the result of performing ? ForIn/OfHeadEvaluation(BoundNames of ForDeclaration, Expression, enumerate).
        let keyResult = ForInOfHeadEvaluation(realm, env, BoundNames(realm, left), right, "enumerate", strictCode);
        keyResult = keyResult.throwIfNotConcreteObject();

        // 2. Return ? ForIn/OfBodyEvaluation(ForDeclaration, Statement, keyResult, lexicalBinding, labelSet).
        return ForInOfBodyEvaluation(realm, env, left, body, keyResult, "lexicalBinding", labelSet, strictCode);
      }
    } else { // for (LeftHandSideExpression in Expression) Statement
      // 1. Let keyResult be ? ForIn/OfHeadEvaluation(« », Expression, enumerate).
      let keyResult = ForInOfHeadEvaluation(realm, env, [], right, "enumerate", strictCode);
      keyResult = keyResult.throwIfNotConcreteObject();

      // 2. Return ? ForIn/OfBodyEvaluation(LeftHandSideExpression, Statement, keyResult, assignment, labelSet).
      return ForInOfBodyEvaluation(realm, env, left, body, keyResult, "assignment", labelSet, strictCode);
    }
  } catch (e) {
    if (e instanceof BreakCompletion) {
      if (!e.target)
        return (UpdateEmpty(realm, e, realm.intrinsics.undefined): any).value;
    }
    throw e;
  }
}

function emitResidualLoopIfSafe(ast: BabelNodeForInStatement, strictCode: boolean, env: LexicalEnvironment, realm: Realm,
    lh: BabelNodeVariableDeclaration, ob: AbstractObjectValue, body: BabelNodeStatement) {
  let oldEnv = realm.getRunningContext().lexicalEnvironment;
  let blockEnv = NewDeclarativeEnvironment(realm, oldEnv);
  realm.getRunningContext().lexicalEnvironment = blockEnv;
  try {
    let envRec = blockEnv.environmentRecord;
    invariant(envRec instanceof DeclarativeEnvironmentRecord, "expected declarative environment record");
    let absStr = realm.createAbstract(
      new TypesDomain(StringValue), ValuesDomain.topVal, [], t.stringLiteral("never used"));
    let boundName;
    for (let n of BoundNames(realm, lh)) {
      if (boundName !== undefined) {
        ob.throwIfNotConcreteObject();
        return realm.intrinsics.undefined;
      }
      boundName = t.identifier(n);
      envRec.CreateMutableBinding(n, false);
      envRec.InitializeBinding(n, absStr);
    }
    let [compl, gen, bindings, properties, createdObj] =
      realm.partially_evaluate_node(body, strictCode, blockEnv);
    if (compl instanceof Value && gen.body.length === 0 && bindings.size === 0 &&
        properties.size === 1 && createdObj.size === 0) {
      let targetObject;
      let sourceObject;
      properties.forEach((desc, key, map) => {
        if (key.object.unknownProperty === key) {
          targetObject = key.object;
          invariant(desc !== undefined);
          let sourceValue = desc.value;
          if (sourceValue instanceof AbstractValue) {
            let cond = sourceValue.args[0];
            if (cond instanceof AbstractValue && cond.kind === "template for property name condition") {
              if (sourceValue.args[2] instanceof UndefinedValue) {
                let mem = sourceValue.args[1];
                if (mem instanceof AbstractValue && mem.kind === "sentinel member expression") {
                  if (mem.args[0] instanceof ObjectValue && mem.args[1] === absStr) {
                    sourceObject = mem.args[0];
                  }
                }
              }
            }
          }
        }
      });
      if (targetObject !== undefined && sourceObject !== undefined) {
        let oe = ob.values.getElements();
        if (oe.size !== 1) ob.throwIfNotConcreteObject();
        let o; for (let co of oe) o = co; invariant(o !== undefined);
        let generator = realm.generator; invariant(generator !== undefined);
        generator.body.push({
          // duplicate args to ensure refcount > 1
          args: [o, targetObject, sourceObject, ob, targetObject, sourceObject],
          buildNode: ([obj, tgt, src, obj1, tgt1, src1]) => {
            invariant(boundName !== undefined);
            return t.forInStatement(lh, obj,
              t.blockStatement([t.expressionStatement(t.assignmentExpression("=",
              t.memberExpression(tgt, boundName, true),
              t.memberExpression(src, boundName, true)))]));
          },
        });
        return realm.intrinsics.undefined;
      }
    }
  } finally {
    // 6. Set the running execution context's LexicalEnvironment to oldEnv.
    realm.getRunningContext().lexicalEnvironment = oldEnv;
  }

  ob.throwIfNotConcreteObject();
  return realm.intrinsics.undefined;
}
