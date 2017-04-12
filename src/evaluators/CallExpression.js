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
import { EnvironmentRecord } from "../environment.js";
import type { Value } from "../values/index.js";
import { ConcreteValue, AbstractValue, FunctionValue } from "../values/index.js";
import { Reference } from "../environment.js";
import { PerformEval } from "../methods/function.js";
import {
  SameValue,
  GetValue,
  GetThisValue,
  GetBase,
  IsInTailPosition,
  IsPropertyReference,
  GetReferencedName,
  EvaluateDirectCall,
  ArgumentListEvaluation
} from "../methods/index.js";
import type { BabelNode, BabelNodeCallExpression, BabelNodeExpression, BabelNodeSpreadElement } from "babel-types";
import invariant from "../invariant.js";
import * as t from "babel-types";
import { TypesDomain, ValuesDomain } from "../domains/index.js";

export default function (ast: BabelNodeCallExpression, strictCode: boolean, env: LexicalEnvironment, realm: Realm): Value | Reference {
  // ECMA262 12.3.4.1
  realm.setNextExecutionContextLocation(ast.loc);

  // 1. Let ref be the result of evaluating MemberExpression.
  let ref = env.evaluate(ast.callee, strictCode);

  // 2. Let func be ? GetValue(ref).
  let func = GetValue(realm, ref);

  if (func instanceof AbstractValue && func.getType() === FunctionValue) {
    let args =
      [func].concat(ArgumentListEvaluation(realm, strictCode, env, ((ast.arguments: any): Array<BabelNode>)));
    return realm.deriveAbstract(
      new TypesDomain(AbstractValue),
      ValuesDomain.topVal,
      args,
      (nodes) => {
        let fun_args = ((nodes.slice(1): any): Array<BabelNodeExpression | BabelNodeSpreadElement>);
        return t.callExpression(nodes[0], fun_args);
      });
  }
  func = func.throwIfNotConcrete();

  // 3. If Type(ref) is Reference and IsPropertyReference(ref) is false and GetReferencedName(ref) is "eval", then
  if (ref instanceof Reference && !IsPropertyReference(realm, ref) && GetReferencedName(realm, ref) === "eval") {
    // a. If SameValue(func, %eval%) is true, then
    if (func instanceof ConcreteValue && SameValue(realm, func, realm.intrinsics.eval)) {
      // i. Let argList be ? ArgumentListEvaluation(Arguments).
      let argList = ArgumentListEvaluation(realm, strictCode, env, ((ast.arguments: any): Array<BabelNode>));
      // ii. If argList has no elements, return undefined.
      if (argList.length === 0) return realm.intrinsics.undefined;
      // iii. Let evalText be the first element of argList.
      let evalText = argList[0];
      // iv. If the source code matching this CallExpression is strict code, let strictCaller be true. Otherwise let strictCaller be false.
      let strictCaller = strictCode;
      // v. Let evalRealm be the current Realm Record.
      let evalRealm = realm;
      // vi. Return ? PerformEval(evalText, evalRealm, strictCaller, true).
      return PerformEval(realm, evalText, evalRealm, strictCaller, true);
    }
  }

  let thisValue;

  // 4. If Type(ref) is Reference, then
  if (ref instanceof Reference) {
    // a. If IsPropertyReference(ref) is true, then
    if (IsPropertyReference(realm, ref)) {
      // i. Let thisValue be GetThisValue(ref).
      thisValue = GetThisValue(realm, ref);
    } else { // b. Else, the base of ref is an Environment Record
      // i. Let refEnv be GetBase(ref).
      let refEnv = GetBase(realm, ref);
      invariant(refEnv instanceof EnvironmentRecord);

      // ii. Let thisValue be refEnv.WithBaseObject().
      thisValue = refEnv.WithBaseObject();
    }
  } else { // 5. Else Type(ref) is not Reference,
    // a. Let thisValue be undefined.
    thisValue = realm.intrinsics.undefined;
  }

  // 6. Let thisCall be this CallExpression.
  let thisCall = ast;

  // 7. Let tailCall be IsInTailPosition(thisCall). (See 14.6.1)
  let tailCall = IsInTailPosition(realm, thisCall);

  // 8. Return ? EvaluateDirectCall(func, thisValue, Arguments, tailCall).
  return EvaluateDirectCall(realm, strictCode, env, ref, func, thisValue, ((ast.arguments: any): Array<BabelNode>), tailCall);
}
