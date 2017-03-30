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
import { ThrowCompletion } from "../completions.js";
import { FunctionValue, ObjectValue, UndefinedValue, NullValue, StringValue, Value, AbstractObjectValue } from "../values/index.js";
import { IsConstructor } from "./is.js";
import { ObjectCreate } from "./create.js";
import { DefinePropertyOrThrow } from "./properties.js";
import { Get } from "./get.js";
import { HasSomeCompatibleType } from "./has.js";
import invariant from "../invariant.js";

// ECMA262 9.2.8
export function MakeConstructor(realm: Realm, F: FunctionValue, writablePrototype?: boolean, prototype?: ObjectValue): UndefinedValue {
  // 1. Assert: F is an ECMAScript function object.
  invariant(F instanceof FunctionValue, "expected function value");

  // 2. Assert: F has a [[Construct]] internal method.
  invariant(!!F.$Construct, "expected construct internal method");

  // 3. Assert: F is an extensible object that does not have a prototype own property.
  invariant(F.getExtensible(), "expected extensible object that doesn't have prototype own property");

  // 4. If the writablePrototype argument was not provided, let writablePrototype be true.
  if (writablePrototype === null || writablePrototype === undefined) {
    writablePrototype = true;
  }

  // 5. If the prototype argument was not provided, then
  if (!prototype) {
    // a. Let prototype be ObjectCreate(%ObjectPrototype%).
    prototype = ObjectCreate(realm, realm.intrinsics.ObjectPrototype);

    // b. Perform ! DefinePropertyOrThrow(prototype, "constructor", PropertyDescriptor{[[Value]]: F, [[Writable]]: writablePrototype, [[Enumerable]]: false, [[Configurable]]: true }).
    DefinePropertyOrThrow(realm, prototype, "constructor", {
      value: F,
      writable: writablePrototype,
      enumerable: false,
      configurable: true
    });
  }

  // 6. Perform ! DefinePropertyOrThrow(F, "prototype", PropertyDescriptor{[[Value]]: prototype, [[Writable]]: writablePrototype, [[Enumerable]]: false, [[Configurable]]: false}).
  DefinePropertyOrThrow(realm, F, "prototype", {
    value: prototype,
    writable: writablePrototype,
    enumerable: false,
    configurable: false
  });

  // 7. Return NormalCompletion(undefined).
  return realm.intrinsics.undefined;
}

// ECMA262 7.3.13
export function Construct(realm: Realm, F: ObjectValue, argumentsList?: Array<Value>, newTarget?: ObjectValue): ObjectValue {
  // If newTarget was not passed, let newTarget be F.
  if (!newTarget) newTarget = F;

  // If argumentsList was not passed, let argumentsList be a new empty List.
  if (!argumentsList) argumentsList = [];

  // Assert: IsConstructor(F) is true.
  invariant(IsConstructor(realm, F), "expected constructor");

  // Assert: IsConstructor(newTarget) is true.
  invariant(IsConstructor(realm, newTarget), "expected constructor");

  // Return ? F.[[Construct]](argumentsList, newTarget).
  invariant(F.$Construct, "no construct method on realm value");
  return F.$Construct(argumentsList, newTarget);
}

// ECMA262 7.3.20
export function SpeciesConstructor(realm: Realm, O: ObjectValue, defaultConstructor: ObjectValue): ObjectValue {
  // 1. Assert: Type(O) is Object.
  invariant(O instanceof ObjectValue, "Type(O) is Object");

  // 2. Let C be ? Get(O, "constructor").
  let C = Get(realm, O, "constructor");

  // 3. If C is undefined, return defaultConstructor.
  if (C instanceof UndefinedValue) return defaultConstructor;

  // 4. If Type(C) is not Object, throw a TypeError exception.
  if (!(C instanceof ObjectValue || C instanceof AbstractObjectValue)) {
    C.throwIfNotConcrete();
    throw new ThrowCompletion(
      Construct(realm, realm.intrinsics.TypeError, [new StringValue(realm, "Type(C) is not an object")])
    );
  }

  // 5. Let S be ? Get(C, @@species).
  let S = Get(realm, C, realm.intrinsics.SymbolSpecies);

  // 6. If S is either undefined or null, return defaultConstructor.
  if (HasSomeCompatibleType(realm, S, UndefinedValue, NullValue)) return defaultConstructor;

  // 7. If IsConstructor(S) is true, return S.
  if (IsConstructor(realm, S)) {
    invariant(S instanceof ObjectValue);
    return S;
  }

  // 8. Throw a TypeError exception.
  throw new ThrowCompletion(
    Construct(realm, realm.intrinsics.TypeError, [new StringValue(realm, "Throw a TypeError exception")])
  );
}
