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
import { BreakCompletion, SimpleNormalCompletion } from "../completions.js";
import { DeclarativeEnvironmentRecord } from "../environment.js";
import { CompilerDiagnostic, FatalError } from "../errors.js";
import { ForInOfHeadEvaluation, ForInOfBodyEvaluation } from "./ForOfStatement.js";
import { EnumerableOwnProperties, UpdateEmpty } from "../methods/index.js";
import { Environment } from "../singletons.js";
import { AbstractValue, AbstractObjectValue, ArrayValue, ObjectValue, StringValue, Value } from "../values/index.js";
import type {
  BabelNodeExpression,
  BabelNodeForInStatement,
  BabelNodeSourceLocation,
  BabelNodeStatement,
  BabelNodeVariableDeclaration,
} from "@babel/types";
import invariant from "../invariant.js";
import * as t from "@babel/types";

// helper func to report error
function reportError(realm: Realm, loc: ?BabelNodeSourceLocation) {
  let error = new CompilerDiagnostic(
    "for in loops over unknown objects are not yet supported",
    loc,
    "PP0013",
    "FatalError"
  );
  realm.handleError(error);
  throw new FatalError();
}

// ECMA262 13.7.5.11
export default function(
  ast: BabelNodeForInStatement,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm,
  labelSet: ?Array<string>
): Value {
  let { left, right, body } = ast;

  function reportErrorAndThrowIfNotConcrete(val: Value, loc: ?BabelNodeSourceLocation) {
    if (val instanceof AbstractValue) reportError(realm, loc);
  }

  try {
    if (left.type === "VariableDeclaration") {
      if (left.kind === "var") {
        // for (var ForBinding in Expression) Statement
        // 1. Let keyResult be ? ForIn/OfHeadEvaluation(« », Expression, enumerate).
        let keyResult = ForInOfHeadEvaluation(realm, env, [], right, "enumerate", strictCode);
        if (keyResult.isPartialObject() && keyResult.isSimpleObject()) {
          return emitResidualLoopIfSafe(ast, strictCode, env, realm, left, right, keyResult, body);
        }
        reportErrorAndThrowIfNotConcrete(keyResult, right.loc);
        invariant(keyResult instanceof ObjectValue);

        // 2. Return ? ForIn/OfBodyEvaluation(ForBinding, Statement, keyResult, varBinding, labelSet).
        return ForInOfBodyEvaluation(
          realm,
          env,
          left.declarations[0].id,
          body,
          keyResult,
          "varBinding",
          labelSet,
          strictCode
        );
      } else {
        // for (ForDeclaration in Expression) Statement
        // 1. Let keyResult be the result of performing ? ForIn/OfHeadEvaluation(BoundNames of ForDeclaration, Expression, enumerate).
        let keyResult = ForInOfHeadEvaluation(
          realm,
          env,
          Environment.BoundNames(realm, left),
          right,
          "enumerate",
          strictCode
        );
        reportErrorAndThrowIfNotConcrete(keyResult, right.loc);
        invariant(keyResult instanceof ObjectValue);

        // 2. Return ? ForIn/OfBodyEvaluation(ForDeclaration, Statement, keyResult, lexicalBinding, labelSet).
        return ForInOfBodyEvaluation(realm, env, left, body, keyResult, "lexicalBinding", labelSet, strictCode);
      }
    } else {
      // for (LeftHandSideExpression in Expression) Statement
      // 1. Let keyResult be ? ForIn/OfHeadEvaluation(« », Expression, enumerate).
      let keyResult = ForInOfHeadEvaluation(realm, env, [], right, "enumerate", strictCode);
      reportErrorAndThrowIfNotConcrete(keyResult, right.loc);
      invariant(keyResult instanceof ObjectValue);

      // 2. Return ? ForIn/OfBodyEvaluation(LeftHandSideExpression, Statement, keyResult, assignment, labelSet).
      return ForInOfBodyEvaluation(realm, env, left, body, keyResult, "assignment", labelSet, strictCode);
    }
  } catch (e) {
    if (e instanceof BreakCompletion) {
      if (!e.target) return (UpdateEmpty(realm, e, realm.intrinsics.undefined): any).value;
    }
    throw e;
  }
}

function emitResidualLoopIfSafe(
  ast: BabelNodeForInStatement,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm,
  lh: BabelNodeVariableDeclaration,
  obexpr: BabelNodeExpression,
  ob: ObjectValue | AbstractObjectValue,
  body: BabelNodeStatement
) {
  invariant(ob.isSimpleObject());
  let oldEnv = realm.getRunningContext().lexicalEnvironment;
  let blockEnv = Environment.NewDeclarativeEnvironment(realm, oldEnv);
  realm.getRunningContext().lexicalEnvironment = blockEnv;
  try {
    let envRec = blockEnv.environmentRecord;
    invariant(envRec instanceof DeclarativeEnvironmentRecord, "expected declarative environment record");
    let absStr = AbstractValue.createFromType(realm, StringValue);
    let boundName;
    for (let n of Environment.BoundNames(realm, lh)) {
      invariant(boundName === undefined);
      boundName = t.identifier(n);
      envRec.CreateMutableBinding(n, false);
      envRec.InitializeBinding(n, absStr);
    }
    let { result, generator: gen, modifiedBindings, modifiedProperties, createdObjects } = realm.evaluateNodeForEffects(
      body,
      strictCode,
      blockEnv
    );
    if (
      result instanceof SimpleNormalCompletion &&
      gen.empty() &&
      modifiedBindings.size === 0 &&
      modifiedProperties.size === 1
    ) {
      invariant(createdObjects.size === 0); // or there will be more than one property
      let targetObject;
      let sourceObject;
      modifiedProperties.forEach((desc, key, map) => {
        if (key.object.unknownProperty === key) {
          targetObject = key.object;
          invariant(desc !== undefined);
          let sourceValue = desc.throwIfNotConcrete(realm).value;
          if (sourceValue instanceof AbstractValue) {
            // because sourceValue was written to key.object.unknownProperty it must be that
            let cond = sourceValue.args[0];
            // and because the write always creates a value of this shape
            invariant(cond instanceof AbstractValue && cond.kind === "template for property name condition");
            let falseVal = sourceValue.args[2];
            if (falseVal instanceof AbstractValue && falseVal.kind === "template for prototype member expression") {
              // check that the value that was assigned itself came from
              // an expression of the form sourceObject[absStr].
              let mem = sourceValue.args[1];
              while (mem instanceof AbstractValue) {
                if (
                  mem.kind === "sentinel member expression" &&
                  mem.args[0] instanceof ObjectValue &&
                  mem.args[1] === absStr
                ) {
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
      if (targetObject instanceof ObjectValue && sourceObject !== undefined) {
        let o = ob;
        if (ob instanceof AbstractObjectValue && !ob.values.isTop() && ob.values.getElements().size === 1) {
          // Note that it is not safe, in general, to extract a concrete object from the values domain of
          // an abstract object. We can get away with it here only because the concrete object does not
          // escape the code below and is thus never referenced directly in generated code because of this logic.
          for (let oe of ob.values.getElements()) {
            invariant(oe instanceof ObjectValue);
            o = oe;
          }
        }
        let generator = realm.generator;
        invariant(generator !== undefined);
        // make target object simple and partial, so that it returns a fully
        // abstract value for every property it is queried for.
        targetObject.makeSimple();
        targetObject.makePartial();
        if (sourceObject === o) {
          // Known enumerable properties of sourceObject can become known properties of targetObject.
          invariant(sourceObject.isPartialObject());
          // EnumerableOwnProperties is sufficient because sourceObject is simple
          let keyValPairs = EnumerableOwnProperties(realm, sourceObject, "key+value", true);
          for (let keyVal of keyValPairs) {
            invariant(keyVal instanceof ArrayValue);
            let key = keyVal.$Get("0", keyVal);
            let val = keyVal.$Get("1", keyVal);
            invariant(key instanceof StringValue); // sourceObject is simple
            targetObject.$Set(key, val, targetObject);
          }
        }
        // add loop to generator
        invariant(boundName != null);
        generator.emitForInStatement(o, lh, sourceObject, targetObject, boundName);
        return realm.intrinsics.undefined;
      }
    }
  } finally {
    // 6. Set the running execution context's LexicalEnvironment to oldEnv.
    realm.getRunningContext().lexicalEnvironment = oldEnv;
    realm.onDestroyScope(blockEnv);
  }

  reportError(realm, obexpr.loc);
  invariant(false);
}
