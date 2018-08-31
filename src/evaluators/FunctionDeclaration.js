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
import type { Value } from "../values/index.js";
import { MakeConstructor } from "../methods/construct.js";
import { Create, Functions, Properties } from "../singletons.js";
import { StringValue } from "../values/index.js";
import IsStrict from "../utils/strict.js";
import { PropertyDescriptor } from "../descriptors.js";
import type { BabelNodeFunctionDeclaration } from "@babel/types";

// ECMA262 14.1.20
export default function(
  ast: BabelNodeFunctionDeclaration,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): Value {
  if (ast.generator) {
    // 1. If the function code for GeneratorDeclaration is strict mode code, let strict be true. Otherwise let strict be false.
    let strict = strictCode || IsStrict(ast.body);

    // 2. Let name be StringValue of BindingIdentifier.
    let name;
    if (ast.id) {
      name = new StringValue(realm, ast.id.name);
    } else {
      name = new StringValue(realm, "default");
    }

    // 3. Let F be GeneratorFunctionCreate(Normal, FormalParameters, GeneratorBody, scope, strict).
    let F = Functions.GeneratorFunctionCreate(realm, "normal", ast.params, ast.body, env, strict);

    // 4. Let prototype be ObjectCreate(%GeneratorPrototype%).
    let prototype = Create.ObjectCreate(realm, realm.intrinsics.GeneratorPrototype);

    // 5. Perform DefinePropertyOrThrow(F, "prototype", PropertyDescriptor{[[Value]]: prototype, [[Writable]]: true, [[Enumerable]]: false, [[Configurable]]: false}).
    Properties.DefinePropertyOrThrow(
      realm,
      F,
      "prototype",
      new PropertyDescriptor({
        value: prototype,
        writable: true,
        configurable: false,
      })
    );

    // 6. Perform SetFunctionName(F, name).
    Functions.SetFunctionName(realm, F, name);

    // 7 .Return F.
    return F;
  } else {
    // 1. If the function code for FunctionDeclaration is strict mode code, let strict be true. Otherwise let strict be false.
    let strict = strictCode || IsStrict(ast.body);

    // 2. Let name be StringValue of BindingIdentifier.
    let name;
    if (ast.id) {
      name = new StringValue(realm, ast.id.name);
    } else {
      name = new StringValue(realm, "default");
    }

    // 3. Let F be FunctionCreate(Normal, FormalParameters, FunctionBody, scope, strict).
    let F = Functions.FunctionCreate(realm, "normal", ast.params, ast.body, env, strict);
    if (ast.id && ast.id.name) F.__originalName = ast.id.name;

    // 4. Perform MakeConstructor(F).
    MakeConstructor(realm, F);

    // 5. Perform SetFunctionName(F, name).
    Functions.SetFunctionName(realm, F, name);

    // 6. Return F.
    return F;
  }
}
