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
import { CompilerDiagnostics, FatalError } from "../errors.js";
import { AbstractValue, ConcreteValue, ObjectValue, StringValue } from "../values/index.js";
import {
  ObjectCreate,
  SetFunctionName,
  GetValue,
  CreateDataPropertyOrThrow,
  IsAnonymousFunctionDefinition,
  HasOwnProperty,
  PropertyDefinitionEvaluation,
  ToPropertyKey,
  ToString,
} from "../methods/index.js";
import invariant from "../invariant.js";
import type {
  BabelNodeObjectExpression,
  BabelNodeObjectProperty,
  BabelNodeObjectMethod,
  BabelNodeClassMethod,
} from "babel-types";

// Returns the result of evaluating PropertyName.
export function EvalPropertyName(
  prop: BabelNodeObjectProperty | BabelNodeObjectMethod | BabelNodeClassMethod,
  env: LexicalEnvironment,
  realm: Realm,
  strictCode: boolean
): PropertyKeyValue {
  let result = EvalPropertyNamePartial(prop, env, realm, strictCode);
  if (result instanceof AbstractValue) {
    let error = new CompilerDiagnostics("unknown computed property name", prop.loc, "PP0014", "FatalError");
    realm.handleError(error);
    throw new FatalError();
  }
  return (result: any);
}

function EvalPropertyNamePartial(
  prop: BabelNodeObjectProperty | BabelNodeObjectMethod | BabelNodeClassMethod,
  env: LexicalEnvironment,
  realm: Realm,
  strictCode: boolean
): AbstractValue | PropertyKeyValue {
  if (prop.computed) {
    let propertyKeyName = GetValue(realm, env.evaluate(prop.key, strictCode));
    if (propertyKeyName instanceof AbstractValue) return propertyKeyName;
    invariant(propertyKeyName instanceof ConcreteValue);
    return ToPropertyKey(realm, propertyKeyName);
  } else {
    if (prop.key.type === "Identifier") {
      return new StringValue(realm, prop.key.name);
    } else {
      let propertyKeyName = GetValue(realm, env.evaluate(prop.key, strictCode));
      invariant(propertyKeyName instanceof ConcreteValue); // syntax only allows literals if !prop.computed
      return ToString(realm, propertyKeyName);
    }
  }
}

// ECMA262 12.2.6.8
export default function(
  ast: BabelNodeObjectExpression,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): ObjectValue {
  // 1. Let obj be ObjectCreate(%ObjectPrototype%).
  let obj = ObjectCreate(realm, realm.intrinsics.ObjectPrototype);

  // 2. Let status be the result of performing PropertyDefinitionEvaluation of PropertyDefinitionList with arguments obj and true.
  for (let prop of ast.properties) {
    if (prop.type === "ObjectProperty") {
      // 12.2.6.9 case 3
      // 1. Let propKey be the result of evaluating PropertyName.
      let propKey = EvalPropertyNamePartial(prop, env, realm, strictCode);

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
        invariant(!hasNameProperty); // No expression that passes through IsAnonymousFunctionDefinition can have it here
        SetFunctionName(realm, propValue, propKey);
      }

      // 6. Assert: enumerable is true.

      // 7. Return CreateDataPropertyOrThrow(object, propKey, propValue).
      if (propKey instanceof AbstractValue) {
        if (propKey.mightNotBeString()) {
          let error = new CompilerDiagnostics("property key value is unknown", prop.loc, "PP0011", "FatalError");
          if (realm.handleError(error) === "Fail") throw new FatalError();
          continue; // recover by ignoring the property, which is only ever safe to do if the property is dead,
          // which is assuming a bit much, hence the designation as a FatalError.
        }
        obj.$SetPartial(propKey, propValue, obj);
      } else {
        CreateDataPropertyOrThrow(realm, obj, propKey, propValue);
      }
    } else {
      invariant(prop.type === "ObjectMethod");
      PropertyDefinitionEvaluation(realm, prop, obj, env, strictCode, true);
    }
  }

  // 3. ReturnIfAbrupt(status).

  // 4. Return obj.
  return obj;
}
