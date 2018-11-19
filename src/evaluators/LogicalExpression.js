/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import type { Realm } from "../realm.js";
import { Effects } from "../realm.js";
import { SimpleNormalCompletion } from "../completions.js";
import { InfeasiblePathError } from "../errors.js";
import { construct_empty_effects } from "../realm.js";
import type { LexicalEnvironment } from "../environment.js";
import { AbstractValue, ConcreteValue, Value } from "../values/index.js";
import { Reference } from "../environment.js";
import { Environment } from "../singletons.js";
import type { BabelNodeLogicalExpression } from "@babel/types";
import invariant from "../invariant.js";
import { Join, Path, To } from "../singletons.js";

export default function(
  ast: BabelNodeLogicalExpression,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): Value | Reference {
  let lref = env.evaluate(ast.left, strictCode);
  let lval = Environment.GetValue(realm, lref);

  if (lval instanceof ConcreteValue) {
    let lbool = To.ToBoolean(realm, lval);

    if (ast.operator === "&&") {
      // ECMA262 12.13.3
      if (lbool === false) return lval;
    } else {
      invariant(ast.operator === "||");
      // ECMA262 12.13.3
      if (lbool === true) return lval;
    }

    let rref = env.evaluate(ast.right, strictCode);
    return Environment.GetValue(realm, rref);
  }
  invariant(lval instanceof AbstractValue);
  let lcond = Environment.GetConditionValue(realm, lref);

  if (!lcond.mightNotBeFalse()) return ast.operator === "||" ? env.evaluate(ast.right, strictCode) : lval;
  if (!lcond.mightNotBeTrue()) return ast.operator === "&&" ? env.evaluate(ast.right, strictCode) : lval;
  invariant(lcond instanceof AbstractValue);

  // Create empty effects for the case where ast.right is not evaluated
  let {
    result: result1,
    generator: generator1,
    modifiedBindings: modifiedBindings1,
    modifiedProperties: modifiedProperties1,
    createdObjects: createdObjects1,
    createdAbstracts: createdAbstracts1,
  } = construct_empty_effects(realm);
  result1; // ignore

  // Evaluate ast.right in a sandbox to get its effects
  let result2, generator2, modifiedBindings2, modifiedProperties2, createdObjects2, createdAbstracts2;
  try {
    let wrapper = ast.operator === "&&" ? Path.withCondition : Path.withInverseCondition;
    ({
      result: result2,
      generator: generator2,
      modifiedBindings: modifiedBindings2,
      modifiedProperties: modifiedProperties2,
      createdObjects: createdObjects2,
      createdAbstracts: createdAbstracts2,
    } = wrapper(lcond, () => realm.evaluateNodeForEffects(ast.right, strictCode, env)));
  } catch (e) {
    if (e instanceof InfeasiblePathError) {
      // if && then lcond cannot be true on this path else lcond cannot be false on this path.
      // Either way, we need to return just lval and not evaluate ast.right
      return lval;
    }
    throw e;
  }

  // Join the effects, creating an abstract view of what happened, regardless
  // of the actual value of lval.
  // Note that converting a value to boolean never has a side effect, so we can
  // use lval as is for the join condition.
  let joinedEffects;
  if (ast.operator === "&&") {
    joinedEffects = Join.joinEffects(
      lcond,
      new Effects(result2, generator2, modifiedBindings2, modifiedProperties2, createdObjects2, createdAbstracts2),
      new Effects(
        new SimpleNormalCompletion(lval),
        generator1,
        modifiedBindings1,
        modifiedProperties1,
        createdObjects1,
        createdAbstracts1
      )
    );
  } else {
    joinedEffects = Join.joinEffects(
      lcond,
      new Effects(
        new SimpleNormalCompletion(lval),
        generator1,
        modifiedBindings1,
        modifiedProperties1,
        createdObjects1,
        createdAbstracts1
      ),
      new Effects(result2, generator2, modifiedBindings2, modifiedProperties2, createdObjects2, createdAbstracts2)
    );
  }

  realm.applyEffects(joinedEffects);
  let completion = realm.returnOrThrowCompletion(joinedEffects.result);
  if (lval instanceof Value && result2.value instanceof Value) {
    // joinEffects does the right thing for the side effects of the second expression but for the result the join
    // produces a conditional expressions of the form (a ? b : a) for a && b and (a ? a : b) for a || b
    // Rather than look for this pattern everywhere, we override this behavior and replace the completion with
    // the actual logical operator. This helps with simplification and reasoning when dealing with path conditions.
    completion = AbstractValue.createFromLogicalOp(realm, ast.operator, lval, result2.value, ast.loc);
  }
  return completion;
}
