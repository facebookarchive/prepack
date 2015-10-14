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
import type { Reference } from "../environment.js";
import type { PropertyKeyValue } from "../types.js";
import { ObjectValue, StringValue } from "../values/index.js";
import {
  ObjectCreate,
  SetFunctionName,
  GetValue,
  ToStringPartial,
  ToPropertyKey,
  CreateDataPropertyOrThrow,
  IsAnonymousFunctionDefinition,
  HasOwnProperty,
  FunctionCreate,
  DefinePropertyOrThrow,
  MakeMethod
} from "../methods/index.js";
import IsStrict from "../utils/strict.js";
import invariant from "../invariant.js";
import type { BabelNodeObjectExpression, BabelNodeObjectProperty, BabelNodeObjectMethod } from "babel-types";

// Returns the result of evaluating PropertyName.
function EvalPropertyName(prop: BabelNodeObjectProperty | BabelNodeObjectMethod, env: LexicalEnvironment, realm: Realm, strictCode: boolean): PropertyKeyValue {
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
      if (prop.kind === "method") {
        // 1. Let methodDef be DefineMethod of MethodDefinition with argument object.
        let methodDef;
        {
          // 1. Let propKey be the result of evaluating PropertyName.
          let propKey = EvalPropertyName(prop, env, realm, strictCode);

          // 2. ReturnIfAbrupt(propKey).

          // 3. If the function code for this MethodDefinition is strict mode code, let strict be true. Otherwise let strict be false.
          let strict = strictCode || IsStrict(prop.body);

          // 4. Let scope be the running execution context's LexicalEnvironment.
          let scope = env;

          // 5. If functionPrototype was passed as a parameter, let kind be Normal; otherwise let kind be Method.
          let kind = "method";

          // 6. Let closure be FunctionCreate(kind, StrictFormalParameters, FunctionBody, scope, strict). If functionPrototype was passed as a parameter, then pass its value as the prototype optional argument of FunctionCreate.
          let closure = FunctionCreate(realm, kind, prop.params, prop.body, scope, strict);

          // 7. Perform MakeMethod(closure, object).
          MakeMethod(realm, closure, obj);

          // 8. Return the Record{[[Key]]: propKey, [[Closure]]: closure}.
          methodDef = { $Key: propKey, $Closure: closure };
        }

        // 2. ReturnIfAbrupt(methodDef).

        // 3. Perform SetFunctionName(methodDef.[[Closure]], methodDef.[[Key]]).
        SetFunctionName(realm, methodDef.$Closure, methodDef.$Key);

        // 4. Let desc be the PropertyDescriptor{[[Value]]: methodDef.[[Closure]], [[Writable]]: true, [[Enumerable]]: enumerable, [[Configurable]]: true}.
        let desc = {
          value: methodDef.$Closure,
          writable: true,
          enumerable: true,
          configurable: true
        };

        // 5. Return ? DefinePropertyOrThrow(object, methodDef.[[Key]], desc).
        DefinePropertyOrThrow(realm, obj, methodDef.$Key, desc);
      } else if (prop.kind === "get") {
        // 1. Let propKey be the result of evaluating PropertyName.
        let propKey = EvalPropertyName(prop, env, realm, strictCode);

        // 2. ReturnIfAbrupt(propKey).

        // 3. If the function code for this MethodDefinition is strict mode code, let strict be true. Otherwise let strict be false.
        let strict = strictCode || IsStrict(prop.body);

        // 4. Let scope be the running execution context's LexicalEnvironment.
        let scope = env;

        // 5. Let formalParameterList be the production FormalParameters:[empty] .
        let formalParameterList = [];

        // 6. Let closure be FunctionCreate(Method, formalParameterList, FunctionBody, scope, strict).
        let closure = FunctionCreate(realm, "method", formalParameterList, prop.body, scope, strict);

        // 7. Perform MakeMethod(closure, object).
        MakeMethod(realm, closure, obj);

        // 8. Perform SetFunctionName(closure, propKey, "get").
        SetFunctionName(realm, closure, propKey, "get");

        // 9. Let desc be the PropertyDescriptor{[[Get]]: closure, [[Enumerable]]: enumerable, [[Configurable]]: true}.
        let desc = {
          get: closure,
          enumerable: true,
          configurable: true
        };

        // 10. Return ? DefinePropertyOrThrow(object, propKey, desc).
        DefinePropertyOrThrow(realm, obj, propKey, desc);
      } else {
        // 1. Let propKey be the result of evaluating PropertyName.
        let propKey = EvalPropertyName(prop, env, realm, strictCode);

        // 2. ReturnIfAbrupt(propKey).

        // 3. If the function code for this MethodDefinition is strict mode code, let strict be true. Otherwise let strict be false.
        let strict = strictCode || IsStrict(prop.body);

        // 4. Let scope be the running execution context's LexicalEnvironment.
        let scope = env;

        // 5. Let closure be FunctionCreate(Method, PropertySetParameterList, FunctionBody, scope, strict).
        let closure = FunctionCreate(realm, "method", prop.params, prop.body, scope, strict);

        // 6. Perform MakeMethod(closure, object).
        MakeMethod(realm, closure, obj);

        // 7. Perform SetFunctionName(closure, propKey, "set").
        SetFunctionName(realm, closure, propKey, "set");

        // 8. Let desc be the PropertyDescriptor{[[Set]]: closure, [[Enumerable]]: enumerable, [[Configurable]]: true}.
        let desc = {
          set: closure,
          enumerable: true,
          configurable: true
        };

        // 9. Return ? DefinePropertyOrThrow(object, propKey, desc).
        DefinePropertyOrThrow(realm, obj, propKey, desc);
      }
    } else {
      throw new Error("unknown property node");
    }
  }

  // 3. ReturnIfAbrupt(status).

  // 4. Return obj.
  return obj;
}
