/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import type { Realm } from "../../realm.js";
import { Functions, Properties } from "../../singletons.js";
import {
  AbstractValue,
  BooleanValue,
  FunctionValue,
  NativeFunctionValue,
  NullValue,
  NumberValue,
  ObjectValue,
  StringValue,
  UndefinedValue,
  Value,
} from "../../values/index.js";
import { Call } from "../../methods/call.js";
import { Create, To } from "../../singletons.js";
import { Get } from "../../methods/get.js";
import { IsCallable } from "../../methods/is.js";
import { HasOwnProperty, HasSomeCompatibleType } from "../../methods/has.js";
import { OrdinaryHasInstance } from "../../methods/abstract.js";
import invariant from "../../invariant.js";
import { PropertyDescriptor } from "../../descriptors.js";

export default function(realm: Realm, obj: ObjectValue): void {
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
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "not callable");
    }

    // 2. Let argList be a new empty List.
    // 3. If this method was called with more than one argument, then in left to right order,
    //    starting with the second argument, append each argument as the last element of argList.
    argList;

    // TODO #1008 4. Perform PrepareForTailCall().

    // 5. Return ? Call(func, thisArg, argList).
    return Call(realm, func, thisArg, argList);
  });

  function conditionalFunctionApply(
    func,
    thisArg,
    condValue: AbstractValue,
    consequentVal: Value,
    alternateVal: Value
  ): Value {
    return realm.evaluateWithAbstractConditional(
      condValue,
      () => {
        return realm.evaluateForEffects(
          () => functionApply(func, thisArg, consequentVal),
          null,
          "conditionalFunctionApply consequent"
        );
      },
      () => {
        return realm.evaluateForEffects(
          () => functionApply(func, thisArg, alternateVal),
          null,
          "conditionalFunctionApply alternate"
        );
      }
    );
  }

  function functionApply(func, thisArg, argArray) {
    // 1. If IsCallable(func) is false, throw a TypeError exception.
    if (IsCallable(realm, func) === false) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "not callable");
    }

    // 2. If argArray is null or undefined, then
    if (HasSomeCompatibleType(argArray, NullValue, UndefinedValue)) {
      // TODO #1008 a. Perform PrepareForTailCall().

      // b. Return ? Call(func, thisArg).
      return Call(realm, func, thisArg);
    }

    if (argArray instanceof AbstractValue) {
      if (argArray.kind === "conditional") {
        let [condValue, consequentVal, alternateVal] = argArray.args;
        invariant(condValue instanceof AbstractValue);
        return conditionalFunctionApply(func, thisArg, condValue, consequentVal, alternateVal);
      } else if (argArray.kind === "||") {
        let [leftValue, rightValue] = argArray.args;
        invariant(leftValue instanceof AbstractValue);
        return conditionalFunctionApply(func, thisArg, leftValue, leftValue, rightValue);
      } else if (argArray.kind === "&&") {
        let [leftValue, rightValue] = argArray.args;
        invariant(leftValue instanceof AbstractValue);
        return conditionalFunctionApply(func, thisArg, leftValue, rightValue, leftValue);
      }
    }

    // 3. Let argList be ? CreateListFromArrayLike(argArray).
    let argList = Create.CreateListFromArrayLike(realm, argArray);

    // TODO #1008 4. Perform PrepareForTailCall().

    // 5. Return ? Call(func, thisArg, argList).
    return Call(realm, func, thisArg, argList);
  }

  // ECMA262 19.2.3.1
  obj.defineNativeMethod("apply", 2, (func, [thisArg, argArray]) => functionApply(func, thisArg, argArray));

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
    let F = Functions.BoundFunctionCreate(realm, Target, thisArg, args);

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
      } else {
        // c. Else,
        targetLen = targetLen.throwIfNotConcreteNumber();
        // i. Let targetLen be ToInteger(targetLen).
        targetLen = To.ToInteger(realm, targetLen);

        // ii. Let L be the larger of 0 and the result of targetLen minus the number of elements of args.
        L = Math.max(0, targetLen - args.length);
      }
    } else {
      // 7. Else let L be 0.
      L = 0;
    }

    // 8. Perform ! DefinePropertyOrThrow(F, "length", PropertyDescriptor {[[Value]]: L, [[Writable]]: false, [[Enumerable]]: false, [[Configurable]]: true}).
    Properties.DefinePropertyOrThrow(
      realm,
      F,
      "length",
      new PropertyDescriptor({
        value: new NumberValue(realm, L),
        writable: false,
        enumerable: false,
        configurable: true,
      })
    );

    // 9. Let targetName be ? Get(Target, "name").
    let targetName = Get(realm, Target, new StringValue(realm, "name"));

    // 10. If Type(targetName) is not String, let targetName be the empty string.
    if (!(targetName instanceof StringValue)) targetName = realm.intrinsics.emptyString;

    // 11. Perform SetFunctionName(F, targetName, "bound").
    Functions.SetFunctionName(realm, F, targetName, "bound");

    // 12. Return F.
    return F;
  });

  // ECMA262 19.2.3.6
  obj.defineNativeMethod(
    realm.intrinsics.SymbolHasInstance,
    1,
    (context, [V]) => {
      // 1. Let F be the this value.
      let F = context;

      // 2. Return ? OrdinaryHasInstance(F, V).
      return new BooleanValue(realm, OrdinaryHasInstance(realm, F, V));
    },
    { writable: false, configurable: false }
  );

  // ECMA262 19.2.3.5
  obj.defineNativeMethod("toString", 0, _context => {
    let context = _context.throwIfNotConcrete();
    if (context instanceof NativeFunctionValue) {
      let name = context.name;
      if (name instanceof AbstractValue) {
        return new StringValue(realm, `function () {[native code]}`);
      } else {
        invariant(typeof name === "string");
        return new StringValue(realm, `function ${name}() { [native code] }`);
      }
    } else if (context instanceof FunctionValue) {
      // TODO #1009: provide function source code
      return new StringValue(realm, "function () { }");
    } else {
      // 3. Throw a TypeError exception.
      throw realm.createErrorThrowCompletion(
        realm.intrinsics.TypeError,
        new StringValue(realm, "Function.prototype.toString is not generic")
      );
    }
  });
}
