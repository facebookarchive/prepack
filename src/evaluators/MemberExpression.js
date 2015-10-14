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
import type { Value } from "../values/index.js";
import { Reference } from "../environment.js";
import { StringValue } from "../values/index.js";
import { GetValue, ToPropertyKey, RequireObjectCoercible } from "../methods/index.js";
import type { BabelNodeMemberExpression } from "babel-types";

// ECMA262 12.3.2.1
export default function (ast: BabelNodeMemberExpression, strictCode: boolean, env: LexicalEnvironment, realm: Realm): Value | Reference {
  // 1. Let baseReference be the result of evaluating MemberExpression.
  let baseReference = env.evaluate(ast.object, strictCode);

  // 2. Let baseValue be ? GetValue(baseReference).
  let baseValue = GetValue(realm, baseReference);

  let propertyNameValue;
  if (ast.computed) {
    // 3. Let propertyNameReference be the result of evaluating Expression.
    let propertyNameReference = env.evaluate(ast.property, strictCode);

    // 4. Let propertyNameValue be ? GetValue(propertyNameReference).
    propertyNameValue = GetValue(realm, propertyNameReference).throwIfNotConcrete();
  } else {
    // 3. Let propertyNameString be StringValue of IdentifierName.
    propertyNameValue = new StringValue(realm, ast.property.name);
  }

  // 5. Let bv be ? RequireObjectCoercible(baseValue).
  let bv = RequireObjectCoercible(realm, baseValue);

  // 6. Let propertyKey be ? ToPropertyKey(propertyNameValue).
  let propertyKey = ToPropertyKey(realm, propertyNameValue);

  // 7. If the code matched by the syntactic production that is being evaluated is strict mode code, let strict be true, else let strict be false.
  let strict = strictCode;

  // 8. Return a value of type Reference whose base value is bv, whose referenced name is propertyKey, and whose strict reference flag is strict.
  return new Reference(bv, propertyKey, strict);
}
