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
import type { LexicalEnvironment, Reference } from "../environment.js";
import type { Value } from "../values/index.js";
import { ObjectValue, StringValue } from "../values/index.js";
import {
  PutValue,
  GetValue,
  ResolveBinding,
  InitializeReferencedBinding,
  IsAnonymousFunctionDefinition,
  HasOwnProperty,
  SetFunctionName,
  BindingInitialization,
} from "../methods/index.js";
import { ThrowCompletion } from "../completions.js";
import invariant from "../invariant.js";
import type { BabelNodeVariableDeclaration } from "babel-types";

// ECMA262 13.3.1.4
function letAndConst (ast: BabelNodeVariableDeclaration, strictCode: boolean, env: LexicalEnvironment, realm: Realm): Value | Reference {
  for (let declar of ast.declarations) {
    if (declar.id.type !== "Identifier") {
      throw new Error("TODO: Patterns aren't supported yet");
    }

    let Initializer = declar.init;
    if (!Initializer) {
      invariant(ast.kind !== "const", "const without an initializer");

      // 1. Let lhs be ResolveBinding(StringValue of BindingIdentifier).
      let bindingId = declar.id.name;
      let lhs = ResolveBinding(realm, bindingId, strictCode);

      // 2. Return InitializeReferencedBinding(lhs, undefined).
      InitializeReferencedBinding(realm, lhs, realm.intrinsics.undefined);
      continue;
    }

    // 1. Let bindingId be StringValue of BindingIdentifier.
    let bindingId = declar.id.name;

    // 2. Let lhs be ResolveBinding(bindingId).
    let lhs = ResolveBinding(realm, bindingId, strictCode);

    // 3. Let rhs be the result of evaluating Initializer.
    let rhs = env.evaluate(Initializer, strictCode);

    // 4. Let value be ? GetValue(rhs).
    let value = GetValue(realm, rhs);

    // 5. If IsAnonymousFunctionDefinition(Initializer) is true, then
    if (IsAnonymousFunctionDefinition(realm, Initializer)) {
      invariant(value instanceof ObjectValue);

      // a. Let hasNameProperty be ? HasOwnProperty(value, "name").
      let hasNameProperty = HasOwnProperty(realm, value, "name");

      // b. If hasNameProperty is false, perform SetFunctionName(value, bindingId).
      if (!hasNameProperty) SetFunctionName(realm, value, new StringValue(realm, bindingId));
    }

    // 6. Return InitializeReferencedBinding(lhs, value).
    InitializeReferencedBinding(realm, lhs, value);
  }

  return realm.intrinsics.empty;
}

// ECMA262 13.3.2.4
export default function (ast: BabelNodeVariableDeclaration, strictCode: boolean, env: LexicalEnvironment, realm: Realm): Value | Reference {
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
      let lhs = ResolveBinding(realm, bindingId, strictCode);

      // 3. Let rhs be the result of evaluating Initializer.
      let rhs = env.evaluate(Initializer, strictCode);

      // 4. Let value be ? GetValue(rhs).
      let value = GetValue(realm, rhs);
      if (declar.id && declar.id.name) value.__originalName = bindingId;

      // 5. If IsAnonymousFunctionDefinition(Initializer) is true, then
      if (IsAnonymousFunctionDefinition(realm, Initializer)) {
        invariant(value instanceof ObjectValue);

        // a. Let hasNameProperty be ? HasOwnProperty(value, "name").
        let hasNameProperty = HasOwnProperty(realm, value, "name");

        // b. If hasNameProperty is false, perform SetFunctionName(value, bindingId).
        if (!hasNameProperty) SetFunctionName(realm, value, new StringValue(realm, bindingId));
      }

      // 6. Return ? PutValue(lhs, value).
      PutValue(realm, lhs, value);
    } else if ((declar.id.type === "ObjectPattern" || declar.id.type === "ArrayPattern") && Initializer) {
      // 1. Let rhs be the result of evaluating Initializer.
      let rhs = env.evaluate(Initializer, strictCode);

      // 2. Let rval be ? GetValue(rhs).
      let rval = GetValue(realm, rhs);

      // 3. Return the result of performing BindingInitialization for BindingPattern passing rval and undefined as arguments.
      BindingInitialization(realm, declar.id, rval, strictCode, undefined);
    } else {
      throw new ThrowCompletion(new StringValue(realm, "unrecognized declaration"));
    }
  }

  return realm.intrinsics.empty;
}
