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
      invariant(boundName === undefined);
      boundName = t.identifier(n);
      envRec.CreateMutableBinding(n, false);
      envRec.InitializeBinding(n, absStr);
    }
    let [compl, gen, bindings, properties, createdObj] =
      realm.partially_evaluate_node(body, strictCode, blockEnv);
    if (compl instanceof Value && gen.body.length === 0 && bindings.size === 0 &&
        properties.size === 1) {
      invariant(createdObj.size === 0); // or there will be more than one property
      let targetObject;
      let sourceObject;
      properties.forEach((desc, key, map) => {
        if (key.object.unknownProperty === key) {
          targetObject = key.object;
          invariant(desc !== undefined);
          let sourceValue = desc.value;
          if (sourceValue instanceof AbstractValue) {
            // because sourceValue was written to key.object.unknownProperty it must be that
            let cond = sourceValue.args[0];
            // and because the write always creates a value of this shape
            invariant(cond instanceof AbstractValue && cond.kind === "template for property name condition");
            if (sourceValue.args[2] instanceof UndefinedValue) {
              // check that the value that was assigned itself came from
              // an expression of the form sourceObject[absStr].
              let mem = sourceValue.args[1];
              while (mem instanceof AbstractValue) {
                if (mem.kind === "sentinel member expression" && mem.args[0] instanceof ObjectValue && mem.args[1] === absStr) {
                  sourceObject = mem.args[0];
                  break;
                }
                // check if mem is a test for absStr being equal to a known property
                // if so skip over it until we get to the expression of the form sourceObject[absStr].
                let condition = mem.args[0];
                if (condition instanceof AbstractValue && condition.kind === "check for known property") {
                  if (condition.args[0] === absStr) {
                    mem = mem.args[2];
                    continue;
                  }
                }
                break;
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
          args: [o, targetObject, sourceObject, targetObject, sourceObject],
          buildNode: ([obj, tgt, src, obj1, tgt1, src1]) => {
            invariant(boundName !== undefined);
            return t.forInStatement(lh, obj,
              t.blockStatement([t.expressionStatement(t.assignmentExpression("=",
              t.memberExpression(tgt, boundName, true),
              t.memberExpression(src, boundName, true)))]));
          },
        });

        // At this point, we have emitted code to copy over all properties.
        // However, the internal Prepack state of targetObject doesn't represent the copied properties yet.
        // So, we copy all all known properties, and then mark the target object as simple or partial as appropriate.
        // TODO: While correct, this generates inefficient code, which first inlines all known properties, and then copies them over again.

        let template;
        if (sourceObject instanceof AbstractObjectValue) template = sourceObject.getTemplate();

        // TODO: The following case kicks in for ForInStatement11.js, but I don't understand why.
        if (sourceObject instanceof ObjectValue) template = sourceObject;

        if (template !== undefined) {
          invariant(template.properties);
          for (let [key, binding] of template.properties) {
            if (binding === undefined || binding.descriptor === undefined) continue; // deleted
            invariant(binding.descriptor !== undefined);
            invariant(binding.descriptor.value !== undefined);
            targetObject.$Set(key, binding.descriptor.value, targetObject);
          }
        }

        // TODO: All other properties of the target object now have unknown values and those properties must be invalidated.
        if (!targetObject.isSimple()) targetObject.makePartial();

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
