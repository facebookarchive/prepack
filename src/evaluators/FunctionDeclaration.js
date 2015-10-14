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
import { SetFunctionName, FunctionCreate, GeneratorFunctionCreate } from "../methods/function.js";
import { MakeConstructor } from "../methods/construct.js";
import { ObjectCreate } from "../methods/create.js";
import { DefinePropertyOrThrow } from "../methods/properties.js";
import { StringValue } from "../values/index.js";
import IsStrict from "../utils/strict.js";
import type { BabelNodeFunctionDeclaration } from "babel-types";

// ECMA262 14.1.20
export default function (ast: BabelNodeFunctionDeclaration, strictCode: boolean, env: LexicalEnvironment, realm: Realm): Value | Reference {
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
    let F = GeneratorFunctionCreate(realm, "normal", ast.params, ast.body, env, strict);

    // 4. Let prototype be ObjectCreate(%GeneratorPrototype%).
    let prototype = ObjectCreate(realm, realm.intrinsics.GeneratorPrototype);

    // 5. Perform DefinePropertyOrThrow(F, "prototype", PropertyDescriptor{[[Value]]: prototype, [[Writable]]: true, [[Enumerable]]: false, [[Configurable]]: false}).
    DefinePropertyOrThrow(realm, F, "prototype", {
      value: prototype,
      writable: true,
      configurable: false
    });

    // 6. Perform SetFunctionName(F, name).
    SetFunctionName(realm, F, name);

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
    let F = FunctionCreate(realm, "normal", ast.params, ast.body, env, strict);

    // 4. Perform MakeConstructor(F).
    MakeConstructor(realm, F);

    // 5. Perform SetFunctionName(F, name).
    SetFunctionName(realm, F, name);

    // 6. Return F.
    return F;
  }
}
