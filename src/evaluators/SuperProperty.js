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
import type { LexicalEnvironment } from "../environment.js";
import { FunctionEnvironmentRecord } from "../environment.js";
import { Reference } from "../environment.js";
import { StringValue } from "../values/index.js";
import { RequireObjectCoercible } from "../methods/index.js";
import { Environment, To } from "../singletons.js";
import type { BabelNodeMemberExpression } from "@babel/types";
import invariant from "../invariant.js";

function MakeSuperPropertyReference(realm: Realm, propertyKey, strict: boolean): Reference {
  // 1. Let env be GetThisEnvironment( ).
  let env = Environment.GetThisEnvironment(realm);
  invariant(env instanceof FunctionEnvironmentRecord);

  // 2. If env.HasSuperBinding() is false, throw a ReferenceError exception.
  if (!env.HasSuperBinding()) {
    throw realm.createErrorThrowCompletion(realm.intrinsics.ReferenceError, "env does not have super binding");
  }

  // 3. Let actualThis be env.GetThisBinding().
  let actualThis = env.GetThisBinding();

  // 4. ReturnIfAbrupt(actualThis).

  // 5. Let baseValue be env.GetSuperBase().
  let baseValue = env.GetSuperBase();

  // 6. Let bv be RequireObjectCoercible(baseValue).
  let bv = RequireObjectCoercible(realm, baseValue);

  // 7. ReturnIfAbrupt(bv).

  // 8. Return a value of type Reference that is a Super Reference whose base value is bv, whose referenced name is propertyKey, whose thisValue is actualThis, and whose strict reference flag is strict.
  return new Reference(bv, propertyKey, strict, actualThis);
}

// ECMA262 12.3.5.1
export default function SuperProperty(
  ast: BabelNodeMemberExpression,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): Reference {
  // SuperProperty : super [ Expression ]
  if (ast.computed === true) {
    // 1. Let propertyNameReference be the result of evaluating Expression.
    let propertyNameReference = env.evaluate(ast.property, strictCode);

    // 2. Let propertyNameValue be GetValue(propertyNameReference).
    let propertyNameValue = Environment.GetValue(realm, propertyNameReference);

    // 3. Let propertyKey be ToPropertyKey(propertyNameValue).
    let propertyKey = To.ToPropertyKeyPartial(realm, propertyNameValue);

    // 4. ReturnIfAbrupt(propertyKey).

    // 5. If the code matched by the syntactic production that is being evaluated is strict mode code, let strict be true, else let strict be false.
    let strict = strictCode;

    // 6. Return MakeSuperPropertyReference(propertyKey, strict).
    return MakeSuperPropertyReference(realm, propertyKey, strict);
  } else {
    // SuperProperty : super . IdentifierName
    // 1. Let propertyKey be StringValue of IdentifierName.
    let propertyKey = new StringValue(realm, ast.property.name);

    // 2. If the code matched by the syntactic production that is being evaluated is strict mode code, let strict be true, else let strict be false.
    let strict = strictCode;

    // 3. Return MakeSuperPropertyReference(propertyKey, strict).
    return MakeSuperPropertyReference(realm, propertyKey, strict);
  }
}
