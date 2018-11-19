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
import { ObjectValue, StringValue } from "../values/index.js";
import { IsAnonymousFunctionDefinition, HasOwnProperty } from "../methods/index.js";
import { Environment, Functions, Properties } from "../singletons.js";
import invariant from "../invariant.js";
import type { BabelNodeVariableDeclaration } from "@babel/types";

// ECMA262 13.3.1.4
function letAndConst(
  ast: BabelNodeVariableDeclaration,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): Value {
  for (let declar of ast.declarations) {
    let Initializer = declar.init;
    if (declar.id.type === "Identifier" && !Initializer) {
      invariant(ast.kind !== "const", "const without an initializer");

      // 1. Let lhs be ResolveBinding(StringValue of BindingIdentifier).
      let bindingId = declar.id.name;
      let lhs = Environment.ResolveBinding(realm, bindingId, strictCode);

      // 2. Return InitializeReferencedBinding(lhs, undefined).
      Environment.InitializeReferencedBinding(realm, lhs, realm.intrinsics.undefined);
      continue;
    } else if (declar.id.type === "Identifier" && Initializer) {
      // 1. Let bindingId be StringValue of BindingIdentifier.
      let bindingId = declar.id.name;

      // 2. Let lhs be ResolveBinding(bindingId).
      let lhs = Environment.ResolveBinding(realm, bindingId, strictCode);

      // 3. Let rhs be the result of evaluating Initializer.
      let rhs = env.evaluate(Initializer, strictCode);

      // 4. Let value be ? GetValue(rhs).
      let value = Environment.GetValue(realm, rhs);

      // 5. If IsAnonymousFunctionDefinition(Initializer) is true, then
      if (IsAnonymousFunctionDefinition(realm, Initializer)) {
        invariant(value instanceof ObjectValue);

        // a. Let hasNameProperty be ? HasOwnProperty(value, "name").
        let hasNameProperty = HasOwnProperty(realm, value, "name");

        // b. If hasNameProperty is false, perform SetFunctionName(value, bindingId).
        if (!hasNameProperty) Functions.SetFunctionName(realm, value, new StringValue(realm, bindingId));
      }

      // 6. Return InitializeReferencedBinding(lhs, value).
      Environment.InitializeReferencedBinding(realm, lhs, value);
    } else if ((declar.id.type === "ObjectPattern" || declar.id.type === "ArrayPattern") && Initializer) {
      // 1. Let rhs be the result of evaluating Initializer.
      let rhs = env.evaluate(Initializer, strictCode);

      // 2. Let rval be ? GetValue(rhs).
      let rval = Environment.GetValue(realm, rhs);

      // 3. Let env be the running execution context’s LexicalEnvironment.

      // 4. Return the result of performing BindingInitialization for BindingPattern using value and env as the arguments.
      Environment.BindingInitialization(realm, declar.id, rval, strictCode, env);
    } else {
      invariant(false, "unrecognized declaration");
    }
  }

  return realm.intrinsics.empty;
}

// ECMA262 13.3.2.4
export default function(
  ast: BabelNodeVariableDeclaration,
  strictCode: boolean,
  env: LexicalEnvironment,
  realm: Realm
): Value {
  if (ast.kind === "let" || ast.kind === "const") {
    return letAndConst(ast, strictCode, env, realm);
  }

  for (let declar of ast.declarations) {
    let Initializer = declar.init;

    if (declar.id.type === "Identifier" && !Initializer) {
      // VariableDeclaration : BindingIdentifier

      // 1. Return NormalCompletion(empty).
      continue;
    } else if (declar.id.type === "Identifier" && Initializer) {
      // VariableDeclaration : BindingIdentifier Initializer

      // 1. Let bindingId be StringValue of BindingIdentifier.
      let bindingId = declar.id.name;

      // 2. Let lhs be ? ResolveBinding(bindingId).
      let lhs = Environment.ResolveBinding(realm, bindingId, strictCode);

      // 3. Let rhs be the result of evaluating Initializer.
      let rhs = env.evaluate(Initializer, strictCode);

      // 4. Let value be ? GetValue(rhs).
      let value = Environment.GetValue(realm, rhs);
      if (declar.id && declar.id.name !== undefined) value.__originalName = bindingId;

      // 5. If IsAnonymousFunctionDefinition(Initializer) is true, then
      if (IsAnonymousFunctionDefinition(realm, Initializer)) {
        invariant(value instanceof ObjectValue);

        // a. Let hasNameProperty be ? HasOwnProperty(value, "name").
        let hasNameProperty = HasOwnProperty(realm, value, "name");

        // b. If hasNameProperty is false, perform SetFunctionName(value, bindingId).
        if (!hasNameProperty) Functions.SetFunctionName(realm, value, new StringValue(realm, bindingId));
      }

      // 6. Return ? PutValue(lhs, value).
      Properties.PutValue(realm, lhs, value);
    } else if ((declar.id.type === "ObjectPattern" || declar.id.type === "ArrayPattern") && Initializer) {
      // 1. Let rhs be the result of evaluating Initializer.
      let rhs = env.evaluate(Initializer, strictCode);

      // 2. Let rval be ? GetValue(rhs).
      let rval = Environment.GetValue(realm, rhs);

      // 3. Return the result of performing BindingInitialization for BindingPattern passing rval and undefined as arguments.
      Environment.BindingInitialization(realm, declar.id, rval, strictCode, undefined);
    } else {
      invariant(false, "unrecognized declaration");
    }
  }

  return realm.intrinsics.empty;
}
