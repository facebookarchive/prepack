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
import { ProxyValue, NullValue, ObjectValue, Value, UndefinedValue } from "../values/index.js";
import { IsCallable } from "./is.js";
import { GetMethod } from "./get.js";
import { Construct } from "./construct.js";
import { Call } from "./call.js";
import { Create } from "../singletons.js";
import invariant from "../invariant.js";

// ECMA262 9.5.12
export function ProxyCall(realm: Realm, O: ProxyValue, thisArgument: Value, argumentsList: Array<Value>): Value {
  // 1. Let handler be the value of the [[ProxyHandler]] internal slot of O.
  let handler = O.$ProxyHandler;

  // 2. If handler is null, throw a TypeError exception.
  if (handler instanceof NullValue) {
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
  }

  // 3. Assert: Type(handler) is Object.
  invariant(handler instanceof ObjectValue, "expected an object");

  // 4. Let target be the value of the [[ProxyTarget]] internal slot of O.
  let target = O.$ProxyTarget;

  // 5. Let trap be ? GetMethod(handler, "apply").
  let trap = GetMethod(realm, handler, "apply");

  // 6. If trap is undefined, then
  if (trap instanceof UndefinedValue) {
    // a. Return ? Call(target, thisArgument, argumentsList).
    return Call(realm, target, thisArgument, argumentsList);
  }

  // 7. Let argArray be CreateArrayFromList(argumentsList).
  let argArray = Create.CreateArrayFromList(realm, argumentsList);

  // 8. Return ? Call(trap, handler, « target, thisArgument, argArray »).
  return Call(realm, trap.throwIfNotConcrete(), handler, [target, thisArgument, argArray]);
}

// ECMA262 9.5.13
export function ProxyConstruct(
  realm: Realm,
  O: ProxyValue,
  argumentsList: Array<Value>,
  newTarget: ObjectValue
): ObjectValue {
  // 1. Let handler be the value of the [[ProxyHandler]] internal slot of O.
  let handler = O.$ProxyHandler;

  // 2. If handler is null, throw a TypeError exception.
  if (handler instanceof NullValue) {
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
  }

  // 3. Assert: Type(handler) is Object.
  invariant(handler instanceof ObjectValue, "expected an object");

  // 4. Let target be the value of the [[ProxyTarget]] internal slot of O.
  let target = O.$ProxyTarget;
  invariant(target instanceof ObjectValue);

  // 5. Let trap be ? GetMethod(handler, "construct").
  let trap = GetMethod(realm, handler, "construct");

  // 6. If trap is undefined, then
  if (trap instanceof UndefinedValue) {
    // a. Assert: target has a [[Construct]] internal method.
    invariant(target.$Construct, "expected construct method");

    // b. Return ? Construct(target, argumentsList, newTarget).
    return Construct(realm, target, argumentsList, newTarget).throwIfNotConcreteObject();
  }

  // 7. Let argArray be CreateArrayFromList(argumentsList).
  let argArray = Create.CreateArrayFromList(realm, argumentsList);

  // 8. Let newObj be ? Call(trap, handler, « target, argArray, newTarget »).
  let newObj = Call(realm, trap.throwIfNotConcrete(), handler, [target, argArray, newTarget]).throwIfNotConcrete();

  // 9. If Type(newObj) is not Object, throw a TypeError exception.
  if (!(newObj instanceof ObjectValue)) {
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
  }

  // 10. Return newObj.
  return newObj;
}

// ECMA262 9.5.14
export function ProxyCreate(realm: Realm, _target: Value, _handler: Value): ProxyValue {
  let handler = _handler;
  let target = _target.throwIfNotConcrete();

  // 1. If Type(target) is not Object, throw a TypeError exception.
  if (!(target instanceof ObjectValue)) {
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
  }

  // 2. If target is a Proxy exotic object and the value of the [[ProxyHandler]] internal slot of target is null, throw a TypeError exception.
  if (target instanceof ProxyValue && (!target.$ProxyHandler || target.$ProxyHandler instanceof NullValue)) {
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
  }

  handler = handler.throwIfNotConcrete();
  // 3. If Type(handler) is not Object, throw a TypeError exception.
  if (!(handler instanceof ObjectValue)) {
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
  }

  // 4. If handler is a Proxy exotic object and the value of the [[ProxyHandler]] internal slot of handler is null, throw a TypeError exception.
  if (handler instanceof ProxyValue && (!handler.$ProxyHandler || handler.$ProxyHandler instanceof NullValue)) {
    throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
  }

  // 5. Let P be a newly created object.
  // 6. Set P's essential internal methods (except for [[Call]] and [[Construct]]) to the definitions specified in 9.5.
  let P = new ProxyValue(realm);

  // 7. If IsCallable(target) is true, then
  if (IsCallable(realm, target)) {
    // a. Set the [[Call]] internal method of P as specified in 9.5.12.
    P.$Call = (thisArgument, argsList) => {
      return ProxyCall(realm, P, thisArgument, argsList);
    };

    // b. If target has a [[Construct]] internal method, then
    if (target.$Construct) {
      // i. Set the [[Construct]] internal method of P as specified in 9.5.13.
      P.$Construct = (argumentsList, newTarget) => {
        return ProxyConstruct(realm, P, argumentsList, newTarget);
      };
    }
  }

  // 8. Set the [[ProxyTarget]] internal slot of P to target.
  P.$ProxyTarget = target;

  // 9. Set the [[ProxyHandler]] internal slot of P to handler.
  P.$ProxyHandler = handler;

  // 10. Return P.
  return P;
}
