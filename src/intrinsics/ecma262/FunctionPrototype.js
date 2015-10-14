/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */


import type { Realm } from "../../realm.js";
import { BoundFunctionCreate, SetFunctionName } from "../../methods/function.js";
import { DefinePropertyOrThrow } from "../../methods/properties.js";
import { BooleanValue, NullValue, UndefinedValue, NumberValue, StringValue, FunctionValue, NativeFunctionValue, ObjectValue } from "../../values/index.js";
import { Call } from "../../methods/call.js";
import { ToInteger } from "../../methods/to.js";
import { Construct } from "../../methods/construct.js";
import { CreateListFromArrayLike } from "../../methods/create.js";
import { Get } from "../../methods/get.js";
import { IsCallable } from "../../methods/is.js";
import { HasOwnProperty, HasSomeCompatibleType } from "../../methods/has.js";
import { OrdinaryHasInstance } from "../../methods/abstract.js";
import { ThrowCompletion } from "../../completions.js";
import invariant from "../../invariant.js";

export default function (realm: Realm, obj: ObjectValue): void {
  // ECMA262 19.2.3
  obj.$Call = (thisArgument, argsList) => {
    return realm.intrinsics.undefined;
  };

  // ECMA262 19.2.3
  obj.defineNativeProperty("length", realm.intrinsics.zero, { writable: false });

  // ECMA262 19.2.3
  obj.defineNativeProperty("name", realm.intrinsics.emptyString, { writable: false });

  // ECMA262 19.2.3.3
  obj.defineNativeMethod("call", 1, (func, [thisArg, ...argList]) => {
    // 1. If IsCallable(func) is false, throw a TypeError exception.
    if (IsCallable(realm, func) === false) {
      throw new ThrowCompletion(
        Construct(realm, realm.intrinsics.TypeError, [new StringValue(realm, "not callable")])
      );
    }

    // 2. Let argList be a new empty List.
    // 3. If this method was called with more than one argument, then in left to right order,
    //    starting with the second argument, append each argument as the last element of argList.
    argList;

    // TODO 4. Perform PrepareForTailCall().

    // 5. Return ? Call(func, thisArg, argList).
    return Call(realm, func, thisArg, argList);
  });

  // ECMA262 19.2.3.1
  obj.defineNativeMethod("apply", 2, (func, [thisArg, argArray]) => {
    // 1. If IsCallable(func) is false, throw a TypeError exception.
    if (IsCallable(realm, func) === false) {
      throw new ThrowCompletion(
        Construct(realm, realm.intrinsics.TypeError, [new StringValue(realm, "not callable")])
      );
    }

    // 2. If argArray is null or undefined, then
    if (HasSomeCompatibleType(realm, argArray, NullValue, UndefinedValue)) {
      // TODO a. Perform PrepareForTailCall().

      // b. Return ? Call(func, thisArg).
      return Call(realm, func, thisArg);
    }

    // 3. Let argList be ? CreateListFromArrayLike(argArray).
    let argList = CreateListFromArrayLike(realm, argArray);

    // TODO 4. Perform PrepareForTailCall().

    // 5. Return ? Call(func, thisArg, argList).
    return Call(realm, func, thisArg, argList);
  });

  // ECMA262 19.2.3.2
  obj.defineNativeMethod("bind", 1, (context, [thisArg, ...args]) => {
    // 1. Let Target be the realm value.
    let Target = context;

    // 2. If IsCallable(Target) is false, throw a TypeError exception.
    if (IsCallable(realm, Target) === false) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }
    invariant(Target instanceof ObjectValue);

    // 3. Let args be a new (possibly empty) List consisting of all of the argument values provided after thisArg in order.
    args;

    // 4. Let F be ? BoundFunctionCreate(Target, thisArg, args).
    let F = BoundFunctionCreate(realm, Target, thisArg, args);

    // 5. Let targetHasLength be ? HasOwnProperty(Target, "length").
    let targetHasLength = HasOwnProperty(realm, Target, new StringValue(realm, "length"));

    let L;

    // 6. If targetHasLength is true, then
    if (targetHasLength === true) {
      // a. Let targetLen be ? Get(Target, "length").
      let targetLen = Get(realm, Target, new StringValue(realm, "length"));

      // b. If Type(targetLen) is not Number, let L be 0.
      if (!targetLen.mightBeNumber()) {
        L = 0;
      } else { // c. Else,
        targetLen = targetLen.throwIfNotConcreteNumber();
        // i. Let targetLen be ToInteger(targetLen).
        targetLen = ToInteger(realm, targetLen);

        // ii. Let L be the larger of 0 and the result of targetLen minus the number of elements of args.
        L = Math.max(0, targetLen - args.length);
      }
    } else { // 7. Else let L be 0.
      L = 0;
    }

    // 8. Perform ! DefinePropertyOrThrow(F, "length", PropertyDescriptor {[[Value]]: L, [[Writable]]: false, [[Enumerable]]: false, [[Configurable]]: true}).
    DefinePropertyOrThrow(realm, F, "length", {
      value: new NumberValue(realm, L),
      writable: false,
      enumerable: false,
      configurable: true
    });

    // 9. Let targetName be ? Get(Target, "name").
    let targetName = Get(realm, Target, new StringValue(realm, "name"));

    // 10. If Type(targetName) is not String, let targetName be the empty string.
    if (!(targetName instanceof StringValue)) targetName = realm.intrinsics.emptyString;

    // 11. Perform SetFunctionName(F, targetName, "bound").
    SetFunctionName(realm, F, targetName, "bound");

    // 12. Return F.
    return F;
  });

  // 19.2.3.6
  obj.defineNativeMethod(realm.intrinsics.SymbolHasInstance, 1, (context, [V]) => {
    // 1. Let F be the this value.
    let F = context;

    // 2. Return ? OrdinaryHasInstance(F, V).
    return new BooleanValue(realm, OrdinaryHasInstance(realm, F, V));
  }, { writable: false, configurable: false });

  obj.defineNativeMethod("toString", 0, (context) => {
    context = context.throwIfNotConcrete();
    if (context instanceof NativeFunctionValue) {
      return new StringValue(realm, `function ${context.name}() { [native code] }`);
    } else if (context instanceof FunctionValue) {
      return new StringValue(realm, "function () { TODO: provide function source code }");
    } else {
      throw new ThrowCompletion(new StringValue(realm, "Function.prototype.toString is not generic"));
    }
  });
}
