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
import { IntrospectionThrowCompletion } from "../completions.js";
import { construct_empty_effects } from "../realm.js";
import type { LexicalEnvironment } from "../environment.js";
import { ObjectValue, AbstractValue, ConcreteValue, Value } from "../values/index.js";
import { TypesDomain, ValuesDomain } from "../domains/index.js";
import type { Reference } from "../environment.js";
import { GetValue, joinEffects, ToBoolean } from "../methods/index.js";
import type { BabelNodeLogicalExpression } from "babel-types";
import invariant from "../invariant.js";
import * as t from "babel-types";

export default function (ast: BabelNodeLogicalExpression, strictCode: boolean, env: LexicalEnvironment, realm: Realm): Value | Reference {
  let lref = env.evaluate(ast.left, strictCode);
  let lval = GetValue(realm, lref);

  if (lval instanceof ConcreteValue) {
    let lbool = ToBoolean(realm, lval);

    if (ast.operator === "&&") {
      // ECMA262 12.13.3
      if (lbool === false) return lval;
    } else if (ast.operator === "||") {
      // ECMA262 12.13.3
      if (lbool === true) return lval;
    }

    let rref = env.evaluate(ast.right, strictCode);
    return GetValue(realm, rref);
  }
  invariant(lval instanceof AbstractValue);

  if (Value.isTypeCompatibleWith(lval.getType(), ObjectValue)) {
    if (ast.operator === "&&")
      return env.evaluate(ast.right, strictCode);
    else {
      return lval;
    }
  }

  // Create empty effects for the case where ast.left is defined
  let [compl1, gen1, bindings1, properties1, createdObj1] =
    construct_empty_effects(realm);

  // Evaluate ast.right in a sandbox to get its effects
  let [compl2, gen2, bindings2, properties2, createdObj2] =
    realm.partially_evaluate_node(ast.right, strictCode, env);

  if (compl2 instanceof IntrospectionThrowCompletion) {
    realm.restoreBindings(bindings2);
    realm.restoreProperties(properties2);
    throw compl2;
  }
  // todo: don't just give up on abrupt completions, but try to join states
  // eg. foo || throwSomething()
  if (!(compl2 instanceof Value))
    AbstractValue.throwIntrospectionError(lval);
  invariant(compl2 instanceof Value);

  // Join the effects, creating an abstract view of what happened, regardless
  // of the actual value of ast.left.
  let [completion, generator, bindings, properties, createdObjects] =
    ast.operator === "&&" ?
      joinEffects(realm, lval,
        [compl2, gen2, bindings2, properties2, createdObj2],
        [compl1, gen1, bindings1, properties1, createdObj1])
    :
      joinEffects(realm, lval,
        [compl1, gen1, bindings1, properties1, createdObj1],
        [compl2, gen2, bindings2, properties2, createdObj2]);


  // Apply the joined effects to the global state
  realm.restoreBindings(bindings);
  realm.restoreProperties(properties);

  // Add generated code for property modifications
  let realmGenerator = realm.generator;
  invariant(realmGenerator);
  let realmGeneratorBody = realmGenerator.body;
  generator.body.forEach((v, k, a) => realmGeneratorBody.push(v));

  // Ignore the joined completion
  completion;

  // Ignore created objects
  createdObjects;

  // And return an actual logicalExpression
  let types = TypesDomain.joinValues(lval, compl2);
  let values = ValuesDomain.joinValues(realm, lval, compl2);
  let result = realm.createAbstract(types, values,
    [lval, compl2],
    (args) => t.logicalExpression(ast.operator, args[0], args[1]));
   result.values = ValuesDomain.joinValues(realm, lval, compl2);
   return result;
}
