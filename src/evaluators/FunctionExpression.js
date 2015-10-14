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
import { NewDeclarativeEnvironment, SetFunctionName, FunctionCreate,  MakeConstructor } from "../methods/index.js";
import { ObjectCreate } from "../methods/create.js";
import { GeneratorFunctionCreate } from "../methods/function.js";
import { DefinePropertyOrThrow } from "../methods/properties.js";
import { StringValue } from "../values/index.js";
import IsStrict from "../utils/strict.js";
import type { BabelNodeFunctionExpression } from "babel-types";
import invariant from "../invariant.js";

export default function (ast: BabelNodeFunctionExpression, strictCode: boolean, env: LexicalEnvironment, realm: Realm): Value | Reference {
  // ECMA262 14.1.21

  if (ast.id) {
    if (ast.generator) {
      // 1. If the function code for this GeneratorExpression is strict mode code, let strict be true. Otherwise let strict be false.
      let strict = strictCode || IsStrict(ast.body);

      // 2. Let scope be the running execution context's LexicalEnvironment.
      let scope = env;

      // 3. Let funcEnv be NewDeclarativeEnvironment(scope).
      let funcEnv = NewDeclarativeEnvironment(realm, scope);

      // 4. Let envRec be funcEnv's EnvironmentRecord.
      let envRec = funcEnv.environmentRecord;

      // 5. Let name be StringValue of BindingIdentifier.
      invariant(ast.id);
      let name = ast.id.name;

      // 6. Perform envRec.CreateImmutableBinding(name, false).
      envRec.CreateImmutableBinding(name, false);

      // 7. Let closure be GeneratorFunctionCreate(Normal, FormalParameters, GeneratorBody, funcEnv, strict).
      let closure = GeneratorFunctionCreate(realm, "normal", ast.params, ast.body, funcEnv, strict);
      closure.loc = ast.loc;

      // 8. Let prototype be ObjectCreate(%GeneratorPrototype%).
      let prototype = ObjectCreate(realm, realm.intrinsics.GeneratorPrototype);

      // 9. Perform DefinePropertyOrThrow(closure, "prototype", PropertyDescriptor{[[Value]]: prototype, [[Writable]]: true, [[Enumerable]]: false, [[Configurable]]: false}).
      DefinePropertyOrThrow(realm, closure, "prototype", {
        value: prototype,
        writable: true,
        enumerable: false,
        configurable: false
      });

      // 10. Perform SetFunctionName(closure, name).
      SetFunctionName(realm, closure, new StringValue(realm, name));

      // 11. Perform envRec.InitializeBinding(name, closure).
      envRec.InitializeBinding(name, closure);

      // 12. Return closure.
      return closure;
    } else {
      // 1. If the function code for FunctionExpression is strict mode code, let strict be true. Otherwise let strict be false.
      let strict = strictCode || IsStrict(ast.body);

      // 2. Let scope be the running execution context's LexicalEnvironment.
      let scope = env;

      // 3. Let funcEnv be NewDeclarativeEnvironment(scope).
      let funcEnv = NewDeclarativeEnvironment(realm, scope);

      // 4. Let envRec be funcEnv's EnvironmentRecord.
      let envRec = funcEnv.environmentRecord;

      // 5. Let name be StringValue of BindingIdentifier.
      invariant(ast.id);
      let name = ast.id.name;

      // 6. Perform envRec.CreateImmutableBinding(name, false).
      envRec.CreateImmutableBinding(name, false);

      // 7. Let closure be FunctionCreate(Normal, FormalParameters, FunctionBody, funcEnv, strict).
      let closure = FunctionCreate(realm, "normal", ast.params, ast.body, funcEnv, strict);
      closure.loc = ast.loc;

      // 8. Perform MakeConstructor(closure).
      MakeConstructor(realm, closure);

      // 9. Perform SetFunctionName(closure, name).
      SetFunctionName(realm, closure, new StringValue(realm, name));

      // 10. Perform envRec.InitializeBinding(name, closure).
      envRec.InitializeBinding(name, closure);

      // 11. Return closure.
      return closure;
    }
  } else {
    if (ast.generator) {
      // 1. If the function code for this GeneratorExpression is strict mode code, let strict be true. Otherwise let strict be false.
      let strict = strictCode || IsStrict(ast.body);

      // 2. Let scope be the LexicalEnvironment of the running execution context.
      let scope = env;

      // 3. Let closure be GeneratorFunctionCreate(Normal, FormalParameters, GeneratorBody, scope, strict).
      let closure = GeneratorFunctionCreate(realm, "normal", ast.params, ast.body, scope, strict);

      // 4. Let prototype be ObjectCreate(%GeneratorPrototype%).
      let prototype = ObjectCreate(realm, realm.intrinsics.GeneratorPrototype);

      // 5. Perform DefinePropertyOrThrow(closure, "prototype", PropertyDescriptor{[[Value]]: prototype, [[Writable]]: true, [[Enumerable]]: false, [[Configurable]]: false}).
      DefinePropertyOrThrow(realm, closure, "prototype", {
        value: prototype,
        writable: true,
        enumerable: false,
        configurable: false
      });

      // 6. Return closure.
      return closure;
    } else {
      // 1. If the function code for FunctionExpression is strict mode code, let strict be true. Otherwise let strict be false.
      let strict = strictCode || IsStrict(ast.body);

      // 2. Let scope be the LexicalEnvironment of the running execution context.
      let scope = env;

      // 3. Let closure be FunctionCreate(Normal, FormalParameters, FunctionBody, scope, strict).
      let closure = FunctionCreate(realm, "normal", ast.params, ast.body, scope, strict);

      // 4. Perform MakeConstructor(closure).
      MakeConstructor(realm, closure);

      // 5. Return closure.
      return closure;
    }
  }
}
