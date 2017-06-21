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
import type { PropertyKeyValue } from "../types.js";
import type { Value } from "../values/index.js";
import type { Reference } from "../environment.js";
import { ObjectValue, StringValue } from "../values/index.js";
import {
  ObjectCreate,
  SetFunctionName,
  GetValue,
  CreateDataPropertyOrThrow,
  IsAnonymousFunctionDefinition,
  HasOwnProperty,
  PropertyDefinitionEvaluation,
  ToPropertyKey,
  ToStringPartial
} from "../methods/index.js";
import invariant from "../invariant.js";
import type { BabelNodeObjectExpression, BabelNodeObjectProperty, BabelNodeObjectMethod, BabelNodeClassMethod } from "babel-types";

// Returns the result of evaluating PropertyName.
export function EvalPropertyName(prop: BabelNodeObjectProperty | BabelNodeObjectMethod | BabelNodeClassMethod, env: LexicalEnvironment, realm: Realm, strictCode: boolean): PropertyKeyValue {
  if (prop.computed) {
    let propertyKeyName = GetValue(realm, env.evaluate(prop.key, strictCode)).throwIfNotConcrete();
    return ToPropertyKey(realm, propertyKeyName);
  } else {
    if (prop.key.type === "Identifier") {
      return new StringValue(realm, prop.key.name);
    } else {
      return ToStringPartial(realm, GetValue(realm, env.evaluate(prop.key, strictCode)));
    }
  }
}

// ECMA262 12.2.6.8
export default function (ast: BabelNodeObjectExpression, strictCode: boolean, env: LexicalEnvironment, realm: Realm): Value | Reference {
  // 1. Let obj be ObjectCreate(%ObjectPrototype%).
  let obj = ObjectCreate(realm, realm.intrinsics.ObjectPrototype);

  // 2. Let status be the result of performing PropertyDefinitionEvaluation of PropertyDefinitionList with arguments obj and true.
  for (let prop of ast.properties) {
    if (prop.type === "ObjectProperty") {
      // 1. Let propKey be the result of evaluating PropertyName.
      let propKey = EvalPropertyName(prop, env, realm, strictCode);

      // 2. ReturnIfAbrupt(propKey).

      // 3. Let exprValueRef be the result of evaluating AssignmentExpression.
      let exprValueRef = env.evaluate(prop.value, strictCode);

      // 4. Let propValue be ? GetValue(exprValueRef).
      let propValue = GetValue(realm, exprValueRef);

      // 5. If IsAnonymousFunctionDefinition(AssignmentExpression) is true, then
      if (IsAnonymousFunctionDefinition(realm, prop.value)) {
        invariant(propValue instanceof ObjectValue);

        // a. Let hasNameProperty be ? HasOwnProperty(propValue, "name").
        let hasNameProperty = HasOwnProperty(realm, propValue, "name");

        // b. If hasNameProperty is false, perform SetFunctionName(propValue, propKey).
        if (!hasNameProperty) SetFunctionName(realm, propValue, propKey);
      }

      // 6. Assert: enumerable is true.

      // 7. Return CreateDataPropertyOrThrow(object, propKey, propValue).
      CreateDataPropertyOrThrow(realm, obj, propKey, propValue);
    } else if (prop.type === "ObjectMethod") {
      PropertyDefinitionEvaluation(realm, prop, obj, env, strictCode, true);
    } else {
      throw new Error("unknown property node");
    }
  }

  // 3. ReturnIfAbrupt(status).

  // 4. Return obj.
  return obj;
}
