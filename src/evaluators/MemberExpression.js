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
import { Reference } from "../environment.js";
import { StringValue, AbstractValue, Value } from "../values/index.js";
import { RequireObjectCoercible } from "../methods/index.js";
import { Environment, To, Havoc } from "../singletons.js";
import type { BabelNodeMemberExpression } from "babel-types";
import SuperProperty from "./SuperProperty";
import invariant from "../invariant.js";
import * as t from "babel-types";

// ECMA262 12.3.2.1
export default function(
  ast: BabelNodeMemberExpression,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): Reference | AbstractValue {
  if (ast.object.type === "Super") {
    return SuperProperty(ast, strictCode, env, realm);
  }

  // 1. Let baseReference be the result of evaluating MemberExpression.
  let baseReference = env.evaluate(ast.object, strictCode);

  // 2. Let baseValue be ? GetValue(baseReference).
  let baseValue = Environment.GetValue(realm, baseReference);

  let propertyNameValue;
  if (ast.computed) {
    // 3. Let propertyNameReference be the result of evaluating Expression.
    let propertyNameReference = env.evaluate(ast.property, strictCode);

    // 4. Let propertyNameValue be ? GetValue(propertyNameReference).
    propertyNameValue = Environment.GetValue(realm, propertyNameReference);
  } else {
    // 3. Let propertyNameString be StringValue of IdentifierName.
    propertyNameValue = new StringValue(realm, ast.property.name);
  }

  // 5. Let bv be ? RequireObjectCoercible(baseValue).
  let bv = RequireObjectCoercible(realm, baseValue, ast.object.loc);

  // 6. Let propertyKey be ? ToPropertyKey(propertyNameValue).
  let propertyKey = To.ToPropertyKeyPartial(realm, propertyNameValue);

  // 7. If the code matched by the syntactic production that is being evaluated is strict mode code, let strict be true, else let strict be false.
  let strict = strictCode;

  // If the base is abstract and not an abstract simple object, plus the
  // propertyKey is an abstract value, then we won't be able to create
  // a reference as too much is unknown, so we can instead bail-out
  // in pure mode and return an abstract temporal
  if (
    realm.isInPureScope() &&
    bv instanceof AbstractValue &&
    !bv.isSimpleObject() &&
    propertyKey instanceof AbstractValue
  ) {
    // havoc both values
    Havoc.value(realm, bv);
    Havoc.value(realm, propertyKey);
    let val = AbstractValue.createTemporalFromBuildFunction(
      realm,
      Value,
      [bv, propertyKey],
      ([objNode, propertyNode]) => {
        return t.memberExpression(objNode, propertyNode, ast.computed);
      }
    );
    invariant(val instanceof AbstractValue);
    return val;
  }
  // 8. Return a value of type Reference whose base value is bv, whose referenced name is propertyKey, and whose strict reference flag is strict.
  return new Reference(bv, propertyKey, strict);
}
