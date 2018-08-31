/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { Realm } from "../realm.js";
import {
  Value,
  AbstractObjectValue,
  SymbolValue,
  NullValue,
  ObjectValue,
  UndefinedValue,
  StringValue,
} from "./index.js";
import type { Descriptor, PropertyKeyValue } from "../types.js";
import invariant from "../invariant.js";
import { SameValuePartial, SamePropertyKey } from "../methods/abstract.js";
import { GetMethod } from "../methods/get.js";
import { IsExtensible, IsPropertyKey, IsDataDescriptor, IsAccessorDescriptor } from "../methods/is.js";
import { Create, Properties, To } from "../singletons.js";
import { Call } from "../methods/call.js";

function FindPropertyKey(realm: Realm, keys: Array<PropertyKeyValue>, key: PropertyKeyValue): number {
  for (let i = 0; i < keys.length; ++i) {
    if (SamePropertyKey(realm, key, keys[i])) {
      return i;
    }
  }
  return -1;
}

export default class ProxyValue extends ObjectValue {
  $ProxyTarget: NullValue | ObjectValue;
  $ProxyHandler: NullValue | ObjectValue;

  constructor(realm: Realm) {
    super(realm);
  }

  static trackedPropertyNames = ObjectValue.trackedPropertyNames.concat(["$ProxyTarget", "$ProxyHandler"]);

  getTrackedPropertyNames(): Array<string> {
    return ProxyValue.trackedPropertyNames;
  }

  isSimpleObject(): boolean {
    return false;
  }

  usesOrdinaryObjectInternalPrototypeMethods(): boolean {
    return false;
  }

  // ECMA262 9.5.1
  $GetPrototypeOf(): NullValue | AbstractObjectValue | ObjectValue {
    let realm = this.$Realm;

    // 1. Let handler be the value of the [[ProxyHandler]] internal slot of O.
    let handler = this.$ProxyHandler;

    // 2. If handler is null, throw a TypeError exception.
    if (handler instanceof NullValue) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 3. Assert: Type(handler) is Object.
    invariant(handler instanceof ObjectValue, "expected an object");

    // 4. Let target be the value of the [[ProxyTarget]] internal slot of O.
    let target = this.$ProxyTarget;
    invariant(target instanceof ObjectValue);

    // 5. Let trap be ? GetMethod(handler, "getPrototypeOf").
    let trap = GetMethod(realm, handler, "getPrototypeOf");

    // 6. If trap is undefined, then
    if (trap instanceof UndefinedValue) {
      // a. Return ? target.[[GetPrototypeOf]]().
      return target.$GetPrototypeOf();
    }

    // 7. Let handlerProto be ? Call(trap, handler, « target »).
    let handlerProto = Call(realm, trap, handler, [target]);

    // 8. If Type(handlerProto) is neither Object nor Null, throw a TypeError exception.
    if (!(handlerProto instanceof ObjectValue) && !(handlerProto instanceof NullValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 9. Let extensibleTarget be ? IsExtensible(target).
    let extensibleTarget = IsExtensible(realm, target);

    // 10. If extensibleTarget is true, return handlerProto.
    if (extensibleTarget) return handlerProto;

    // 11. Let targetProto be ? target.[[GetPrototypeOf]]().
    let targetProto = target.$GetPrototypeOf();

    // 12. If SameValue(handlerProto, targetProto) is false, throw a TypeError exception.
    if (!SameValuePartial(realm, handlerProto, targetProto)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 13. Return handlerProto.
    return handlerProto;
  }

  // ECMA262 9.5.2
  $SetPrototypeOf(V: ObjectValue | NullValue): boolean {
    let realm = this.$Realm;

    // 1. Assert: Either Type(V) is Object or Type(V) is Null.
    invariant(V instanceof ObjectValue || V instanceof NullValue, "expected object or null");

    // 2. Let handler be the value of the [[ProxyHandler]] internal slot of O.
    let handler = this.$ProxyHandler;

    // 3. If handler is null, throw a TypeError exception.
    if (handler instanceof NullValue) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 4. Assert: Type(handler) is Object.
    invariant(handler instanceof ObjectValue, "expected object");

    // 5. Let target be the value of the [[ProxyTarget]] internal slot of O.
    let target = this.$ProxyTarget;
    invariant(target instanceof ObjectValue);

    // 6. Let trap be ? GetMethod(handler, "setPrototypeOf").
    let trap = GetMethod(realm, handler, "setPrototypeOf");

    // 7. If trap is undefined, then
    if (trap instanceof UndefinedValue) {
      // a. Return ? target.[[SetPrototypeOf]](V).
      return target.$SetPrototypeOf(V);
    }

    // 8. Let booleanTrapResult be ToBoolean(? Call(trap, handler, « target, V »)).
    let booleanTrapResult = To.ToBooleanPartial(realm, Call(realm, trap, handler, [target, V]));

    // 9. If booleanTrapResult is false, return false.
    if (!booleanTrapResult) return false;

    // 10. Let extensibleTarget be ? IsExtensible(target).
    let extensibleTarget = IsExtensible(realm, target);

    // 11. If extensibleTarget is true, return true.
    if (extensibleTarget) return true;

    // 12. Let targetProto be ? target.[[GetPrototypeOf]]().
    let targetProto = target.$GetPrototypeOf();

    // 13. If SameValue(V, targetProto) is false, throw a TypeError exception.
    if (!SameValuePartial(realm, V, targetProto)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 14. Return true.
    return true;
  }

  // ECMA262 9.5.3
  $IsExtensible(): boolean {
    let realm = this.$Realm;

    // 1. Let handler be the value of the [[ProxyHandler]] internal slot of O.
    let handler = this.$ProxyHandler;

    // 2. If handler is null, throw a TypeError exception.
    if (handler instanceof NullValue) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 3. Assert: Type(handler) is Object.
    invariant(handler instanceof ObjectValue, "expected object");

    // 4. Let target be the value of the [[ProxyTarget]] internal slot of O.
    let target = this.$ProxyTarget;

    // 5. Let trap be ? GetMethod(handler, "isExtensible").
    let trap = GetMethod(realm, handler, "isExtensible");

    // 6. If trap is undefined, then
    if (trap instanceof UndefinedValue) {
      // a. Return ? target.[[IsExtensible]]().
      invariant(target instanceof ObjectValue);
      return target.$IsExtensible();
    }

    // 7. Let booleanTrapResult be ToBoolean(? Call(trap, handler, « target »)).
    let booleanTrapResult = To.ToBooleanPartial(realm, Call(realm, trap, handler, [target]));

    // 8. Let targetResult be ? target.[[IsExtensible]]().
    invariant(target instanceof ObjectValue);
    let targetResult = target.$IsExtensible();

    // 9. If SameValue(booleanTrapResult, targetResult) is false, throw a TypeError exception.
    if (booleanTrapResult !== targetResult) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 10. Return booleanTrapResult.
    return booleanTrapResult;
  }

  // ECMA262 9.5.4
  $PreventExtensions(): boolean {
    let realm = this.$Realm;

    // 1. Let handler be the value of the [[ProxyHandler]] internal slot of O.
    let handler = this.$ProxyHandler;

    // 2. If handler is null, throw a TypeError exception.
    if (handler instanceof NullValue) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 3. Assert: Type(handler) is Object.
    invariant(handler instanceof ObjectValue, "expected object");

    // 4. Let target be the value of the [[ProxyTarget]] internal slot of O.
    let target = this.$ProxyTarget;

    // 5. Let trap be ? GetMethod(handler, "preventExtensions").
    let trap = GetMethod(realm, handler, "preventExtensions");

    // 6. If trap is undefined, then
    if (trap instanceof UndefinedValue) {
      // a. Return ? target.[[PreventExtensions]]().
      invariant(target instanceof ObjectValue);
      return target.$PreventExtensions();
    }

    // 7. Let booleanTrapResult be ToBoolean(? Call(trap, handler, « target »)).
    let booleanTrapResult = To.ToBooleanPartial(realm, Call(realm, trap, handler, [target]));

    // 8. If booleanTrapResult is true, then
    if (booleanTrapResult) {
      // a. Let targetIsExtensible be ? target.[[IsExtensible]]().
      invariant(target instanceof ObjectValue);
      let targetIsExtensible = target.$IsExtensible();

      // b. If targetIsExtensible is true, throw a TypeError exception.
      if (targetIsExtensible) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
      }
    }

    // 9. Return booleanTrapResult.
    return booleanTrapResult;
  }

  // ECMA262 9.5.5
  $GetOwnProperty(P: PropertyKeyValue): Descriptor | void {
    let realm = this.$Realm;

    // 1. Assert: IsPropertyKey(P) is true.
    invariant(IsPropertyKey(realm, P), "expected property key");

    // 2. Let handler be the value of the [[ProxyHandler]] internal slot of O.
    let handler = this.$ProxyHandler;

    // 3. If handler is null, throw a TypeError exception.
    if (handler instanceof NullValue) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 4. Assert: Type(handler) is Object.
    invariant(handler instanceof ObjectValue, "expected object");

    // 5. Let target be the value of the [[ProxyTarget]] internal slot of O.
    let target = this.$ProxyTarget;
    invariant(target instanceof ObjectValue);

    // 6. Let trap be ? GetMethod(handler, "getOwnPropertyDescriptor").
    let trap = GetMethod(realm, handler, "getOwnPropertyDescriptor");

    // 7. If trap is undefined, then
    if (trap instanceof UndefinedValue) {
      // a. Return ? target.[[GetOwnProperty]](P).
      return target.$GetOwnProperty(P);
    }

    // 8. Let trapResultObj be ? Call(trap, handler, « target, P »).
    let trapResultObj = Call(realm, trap, handler, [target, typeof P === "string" ? new StringValue(realm, P) : P]);

    // 9. If Type(trapResultObj) is neither Object nor Undefined, throw a TypeError exception.
    if (!(trapResultObj instanceof ObjectValue) && !(trapResultObj instanceof UndefinedValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 10. Let targetDesc be ? target.[[GetOwnProperty]](P).
    let targetDesc = target.$GetOwnProperty(P);

    // 11. If trapResultObj is undefined, then
    if (trapResultObj instanceof UndefinedValue) {
      // a. If targetDesc is undefined, return undefined.
      if (!targetDesc) return undefined;
      Properties.ThrowIfMightHaveBeenDeleted(targetDesc);
      targetDesc = targetDesc.throwIfNotConcrete(realm);

      // b. If targetDesc.[[Configurable]] is false, throw a TypeError exception.
      if (!targetDesc.configurable) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
      }

      // c. Let extensibleTarget be ? IsExtensible(target).
      let extensibleTarget = IsExtensible(realm, target);

      // d. Assert: Type(extensibleTarget) is Boolean.
      invariant(typeof extensibleTarget === "boolean", "expected boolean");

      // e. If extensibleTarget is false, throw a TypeError exception.
      if (!extensibleTarget) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
      }

      // f. Return undefined.
      return undefined;
    }

    // 12. Let extensibleTarget be ? IsExtensible(target).
    let extensibleTarget = IsExtensible(realm, target);

    // 13. Let resultDesc be ? ToPropertyDescriptor(trapResultObj).
    let resultDesc = To.ToPropertyDescriptor(realm, trapResultObj);

    // 14. Call CompletePropertyDescriptor(resultDesc).
    Properties.CompletePropertyDescriptor(realm, resultDesc);

    // 15. Let valid be IsCompatiblePropertyDescriptor(extensibleTarget, resultDesc, targetDesc).
    let valid = Properties.IsCompatiblePropertyDescriptor(realm, extensibleTarget, resultDesc, targetDesc);

    // 16. If valid is false, throw a TypeError exception.
    if (!valid) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 17. If resultDesc.[[Configurable]] is false, then
    resultDesc = resultDesc.throwIfNotConcrete(realm);
    if (!resultDesc.configurable) {
      // a. If targetDesc is undefined or targetDesc.[[Configurable]] is true, then
      if (!targetDesc || targetDesc.throwIfNotConcrete(realm).configurable) {
        // i. Throw a TypeError exception.
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
      }
    }

    // 18. Return resultDesc.
    return resultDesc;
  }

  // ECMA262 9.5.6
  $DefineOwnProperty(P: PropertyKeyValue, Desc: Descriptor): boolean {
    let realm = this.$Realm;

    // 1. Assert: IsPropertyKey(P) is true.
    invariant(IsPropertyKey(realm, P), "expected property key");

    // 2. Let handler be the value of the [[ProxyHandler]] internal slot of O.
    let handler = this.$ProxyHandler;

    // 3. If handler is null, throw a TypeError exception.
    if (handler instanceof NullValue) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 4. Assert: Type(handler) is Object.
    invariant(handler instanceof ObjectValue, "expected object");

    // 5. Let target be the value of the [[ProxyTarget]] internal slot of O.
    let target = this.$ProxyTarget;
    invariant(target instanceof ObjectValue);

    // 6. Let trap be ? GetMethod(handler, "defineProperty").
    let trap = GetMethod(realm, handler, "defineProperty");

    // 7. If trap is undefined, then
    if (trap instanceof UndefinedValue) {
      // a. Return ? target.[[DefineOwnProperty]](P, Desc).
      return target.$DefineOwnProperty(P, Desc);
    }

    // 8. Let descObj be FromPropertyDescriptor(Desc).
    let descObj = Properties.FromPropertyDescriptor(realm, Desc);

    // 9. Let booleanTrapResult be ToBoolean(? Call(trap, handler, « target, P, descObj »)).
    let booleanTrapResult = To.ToBooleanPartial(
      realm,
      Call(realm, trap, handler, [target, typeof P === "string" ? new StringValue(realm, P) : P, descObj])
    );

    // 10. If booleanTrapResult is false, return false.
    if (!booleanTrapResult) return false;

    // 11. Let targetDesc be ? target.[[GetOwnProperty]](P).
    let targetDesc = target.$GetOwnProperty(P);

    // 12. Let extensibleTarget be ? IsExtensible(target).
    let extensibleTarget = IsExtensible(realm, target);

    // 13. If Desc has a [[Configurable]] field and if Desc.[[Configurable]] is false, then
    let settingConfigFalse;
    if (Desc.throwIfNotConcrete(realm).configurable === false) {
      // a. Let settingConfigFalse be true.
      settingConfigFalse = true;
    } else {
      // 14. Else let settingConfigFalse be false.
      settingConfigFalse = false;
    }

    // 15. If targetDesc is undefined, then
    if (!targetDesc) {
      // a. If extensibleTarget is false, throw a TypeError exception.
      if (!extensibleTarget) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
      }

      // b. If settingConfigFalse is true, throw a TypeError exception.
      if (settingConfigFalse) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
      }
    } else {
      // 16. Else targetDesc is not undefined,
      Properties.ThrowIfMightHaveBeenDeleted(targetDesc);

      // a. If IsCompatiblePropertyDescriptor(extensibleTarget, Desc, targetDesc) is false, throw a TypeError exception.
      if (!Properties.IsCompatiblePropertyDescriptor(realm, extensibleTarget, Desc, targetDesc)) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
      }

      // b. If settingConfigFalse is true and targetDesc.[[Configurable]] is true, throw a TypeError exception.
      if (settingConfigFalse && targetDesc.throwIfNotConcrete(realm).configurable) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
      }
    }

    // 17. Return true.
    return true;
  }

  // ECMA262 9.5.7
  $HasProperty(P: PropertyKeyValue): boolean {
    let realm = this.$Realm;

    // 1. Assert: IsPropertyKey(P) is true.
    invariant(IsPropertyKey(realm, P), "expected property key");

    // 2. Let handler be the value of the [[ProxyHandler]] internal slot of O.
    let handler = this.$ProxyHandler;

    // 3. If handler is null, throw a TypeError exception.
    if (handler instanceof NullValue) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 4. Assert: Type(handler) is Object.
    invariant(handler instanceof ObjectValue, "expected object");

    // 5. Let target be the value of the [[ProxyTarget]] internal slot of O.
    let target = this.$ProxyTarget;
    invariant(target instanceof ObjectValue);

    // 6. Let trap be ? GetMethod(handler, "has").
    let trap = GetMethod(realm, handler, "has");

    // 7. If trap is undefined, then
    if (trap instanceof UndefinedValue) {
      // a. Return ? target.[[HasProperty]](P).
      return target.$HasProperty(P);
    }

    // 8. Let booleanTrapResult be ToBoolean(? Call(trap, handler, « target, P »)).
    let booleanTrapResult = To.ToBooleanPartial(
      realm,
      Call(realm, trap, handler, [target, typeof P === "string" ? new StringValue(realm, P) : P])
    );

    // 9. If booleanTrapResult is false, then
    if (!booleanTrapResult) {
      // a. Let targetDesc be ? target.[[GetOwnProperty]](P).
      let targetDesc = target.$GetOwnProperty(P);

      // b. If targetDesc is not undefined, then
      if (targetDesc) {
        Properties.ThrowIfMightHaveBeenDeleted(targetDesc);
        targetDesc = targetDesc.throwIfNotConcrete(realm);

        // i. If targetDesc.[[Configurable]] is false, throw a TypeError exception.
        if (!targetDesc.configurable) {
          throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
        }

        // ii. Let extensibleTarget be ? IsExtensible(target).
        let extensibleTarget = IsExtensible(realm, target);

        // iii. If extensibleTarget is false, throw a TypeError exception.
        if (!extensibleTarget) {
          throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
        }
      }
    }

    // 10. Return booleanTrapResult.
    return booleanTrapResult;
  }

  // ECMA262 9.5.8
  $Get(P: PropertyKeyValue, Receiver: Value): Value {
    let realm = this.$Realm;

    // 1. Assert: IsPropertyKey(P) is true.
    invariant(IsPropertyKey(realm, P), "expected property key");

    // 2. Let handler be the value of the [[ProxyHandler]] internal slot of O.
    let handler = this.$ProxyHandler;

    // 3. If handler is null, throw a TypeError exception.
    if (handler instanceof NullValue) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 4. Assert: Type(handler) is Object.
    invariant(handler instanceof ObjectValue, "expected object");

    // 5. Let target be the value of the [[ProxyTarget]] internal slot of O.
    let target = this.$ProxyTarget;
    invariant(target instanceof ObjectValue);

    // 6. Let trap be ? GetMethod(handler, "get").
    let trap = GetMethod(realm, handler, "get");

    // 7. If trap is undefined, then
    if (trap instanceof UndefinedValue) {
      // a. Return ? target.[[Get]](P, Receiver).
      return target.$Get(P, Receiver);
    }

    // 8. Let trapResult be ? Call(trap, handler, « target, P, Receiver »).
    let trapResult = Call(realm, trap, handler, [
      target,
      typeof P === "string" ? new StringValue(realm, P) : P,
      Receiver,
    ]);

    // 9. Let targetDesc be ? target.[[GetOwnProperty]](P).
    let targetDesc = target.$GetOwnProperty(P);

    // 10. If targetDesc is not undefined, then
    if (targetDesc) {
      Properties.ThrowIfMightHaveBeenDeleted(targetDesc);

      // a. If IsDataDescriptor(targetDesc) is true and targetDesc.[[Configurable]] is false and targetDesc.[[Writable]] is false, then
      if (IsDataDescriptor(realm, targetDesc) && targetDesc.configurable === false && targetDesc.writable === false) {
        // i. If SameValue(trapResult, targetDesc.[[Value]]) is false, throw a TypeError exception.
        let targetValue = targetDesc.value || realm.intrinsics.undefined;
        invariant(targetValue instanceof Value);
        if (!SameValuePartial(realm, trapResult, targetValue)) {
          throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
        }
      }

      // b. If IsAccessorDescriptor(targetDesc) is true and targetDesc.[[Configurable]] is false and targetDesc.[[Get]] is undefined, then
      if (
        IsAccessorDescriptor(realm, targetDesc) &&
        targetDesc.configurable === false &&
        (!targetDesc.get || targetDesc.get instanceof UndefinedValue)
      ) {
        // i. If trapResult is not undefined, throw a TypeError exception.
        if (!(trapResult instanceof UndefinedValue)) {
          throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
        }
      }
    }

    // 11. Return trapResult.
    return trapResult;
  }

  // ECMA262 9.5.9
  $Set(P: PropertyKeyValue, V: Value, Receiver: Value): boolean {
    let realm = this.$Realm;

    // 1. Assert: IsPropertyKey(P) is true.
    invariant(IsPropertyKey(realm, P), "expected property key");

    // 2. Let handler be the value of the [[ProxyHandler]] internal slot of O.
    let handler = this.$ProxyHandler;

    // 3. If handler is null, throw a TypeError exception.
    if (handler instanceof NullValue) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 4. Assert: Type(handler) is Object.
    invariant(handler instanceof ObjectValue, "expected object");

    // 5. Let target be the value of the [[ProxyTarget]] internal slot of O.
    let target = this.$ProxyTarget;

    // 6. Let trap be ? GetMethod(handler, "set").
    let trap = GetMethod(realm, handler, "set");

    // 7. If trap is undefined, then
    if (trap instanceof UndefinedValue) {
      // a. Return ? target.[[Set]](P, V, Receiver).
      invariant(target instanceof ObjectValue);
      return target.$Set(P, V, Receiver);
    }

    // 8. Let booleanTrapResult be ToBoolean(? Call(trap, handler, « target, P, V, Receiver »)).
    let booleanTrapResult = To.ToBooleanPartial(
      realm,
      Call(realm, trap, handler, [target, typeof P === "string" ? new StringValue(realm, P) : P, V, Receiver])
    );

    // 9. If booleanTrapResult is false, return false.
    if (!booleanTrapResult) return false;

    // 10. Let targetDesc be ? target.[[GetOwnProperty]](P).
    invariant(target instanceof ObjectValue);
    let targetDesc = target.$GetOwnProperty(P);

    // 11. If targetDesc is not undefined, then
    if (targetDesc) {
      Properties.ThrowIfMightHaveBeenDeleted(targetDesc);

      // a. If IsDataDescriptor(targetDesc) is true and targetDesc.[[Configurable]] is false and targetDesc.[[Writable]] is false, then
      if (IsDataDescriptor(realm, targetDesc) && !targetDesc.configurable && !targetDesc.writable) {
        // i. If SameValue(V, targetDesc.[[Value]]) is false, throw a TypeError exception.
        let targetValue = targetDesc.value || realm.intrinsics.undefined;
        invariant(targetValue instanceof Value);
        if (!SameValuePartial(realm, V, targetValue)) {
          throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
        }
      }

      // b. If IsAccessorDescriptor(targetDesc) is true and targetDesc.[[Configurable]] is false, then
      if (IsAccessorDescriptor(realm, targetDesc) && !targetDesc.configurable) {
        // i. If targetDesc.[[Set]] is undefined, throw a TypeError exception.
        if (!targetDesc.set || targetDesc.set instanceof UndefinedValue) {
          throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
        }
      }
    }

    // 12. Return true.
    return true;
  }

  // ECMA262 9.5.10
  $Delete(P: PropertyKeyValue): boolean {
    let realm = this.$Realm;

    // 1. Assert: IsPropertyKey(P) is true.
    invariant(IsPropertyKey(realm, P), "expected property key");

    // 2. Let handler be the value of the [[ProxyHandler]] internal slot of O.
    let handler = this.$ProxyHandler;

    // 3. If handler is null, throw a TypeError exception.
    if (handler instanceof NullValue) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 4. Assert: Type(handler) is Object.
    invariant(handler instanceof ObjectValue, "expected object");

    // 5. Let target be the value of the [[ProxyTarget]] internal slot of O.
    let target = this.$ProxyTarget;

    // 6. Let trap be ? GetMethod(handler, "deleteProperty").
    let trap = GetMethod(realm, handler, "deleteProperty");

    // 7. If trap is undefined, then
    if (trap instanceof UndefinedValue) {
      // a. Return ? target.[[Delete]](P).
      invariant(target instanceof ObjectValue);
      return target.$Delete(P);
    }

    // 8. Let booleanTrapResult be ToBoolean(? Call(trap, handler, « target, P »)).
    let booleanTrapResult = To.ToBooleanPartial(
      realm,
      Call(realm, trap, handler, [target, typeof P === "string" ? new StringValue(realm, P) : P])
    );

    // 9. If booleanTrapResult is false, return false.
    if (!booleanTrapResult) return false;

    // 10. Let targetDesc be ? target.[[GetOwnProperty]](P).
    invariant(target instanceof ObjectValue);
    let targetDesc = target.$GetOwnProperty(P);

    // 11. If targetDesc is undefined, return true.
    if (!targetDesc) return true;
    Properties.ThrowIfMightHaveBeenDeleted(targetDesc);
    targetDesc = targetDesc.throwIfNotConcrete(realm);

    // 12. If targetDesc.[[Configurable]] is false, throw a TypeError exception.
    if (!targetDesc.configurable) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 13. Return true.
    return true;
  }

  // ECMA262 9.5.11
  $OwnPropertyKeys(): Array<PropertyKeyValue> {
    let realm = this.$Realm;

    // 1. Let handler be the value of the [[ProxyHandler]] internal slot of O.
    let handler = this.$ProxyHandler;

    // 2. If handler is null, throw a TypeError exception.
    if (handler instanceof NullValue) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 3. Assert: Type(handler) is Object.
    invariant(handler instanceof ObjectValue, "expected object");

    // 4. Let target be the value of the [[ProxyTarget]] internal slot of O.
    let target = this.$ProxyTarget;
    invariant(target instanceof ObjectValue);

    // 5. Let trap be ? GetMethod(handler, "ownKeys").
    let trap = GetMethod(realm, handler, "ownKeys");

    // 6. If trap is undefined, then
    if (trap instanceof UndefinedValue) {
      // a. Return ? target.[[OwnPropertyKeys]]().
      return target.$OwnPropertyKeys();
    }

    // 7. Let trapResultArray be ? Call(trap, handler, « target »).
    let trapResultArray = Call(realm, trap, handler, [target]);

    // 8. Let trapResult be ? CreateListFromArrayLike(trapResultArray, « String, Symbol »).
    let trapResult: Array<PropertyKeyValue> = ((Create.CreateListFromArrayLike(realm, trapResultArray, [
      "String",
      "Symbol",
    ]): any): Array<PropertyKeyValue>);

    // 9. Let extensibleTarget be ? IsExtensible(target).
    let extensibleTarget = IsExtensible(realm, target);

    // 10. Let targetKeys be ? target.[[OwnPropertyKeys]]().
    let targetKeys = target.$OwnPropertyKeys();

    // 11. Assert: targetKeys is a List containing only String and Symbol values.
    for (let key of targetKeys) {
      invariant(key instanceof SymbolValue || key instanceof StringValue, "expected string or symbol");
    }

    // 12. Let targetConfigurableKeys be a new empty List.
    let targetConfigurableKeys = [];

    // 13. Let targetNonconfigurableKeys be a new empty List.
    let targetNonconfigurableKeys = [];

    // 14. Repeat, for each element key of targetKeys,
    for (let key of targetKeys) {
      // a. Let desc be ? target.[[GetOwnProperty]](key).
      let desc = target.$GetOwnProperty(key);
      if (desc) Properties.ThrowIfMightHaveBeenDeleted(desc);

      // b. If desc is not undefined and desc.[[Configurable]] is false, then
      if (desc && desc.throwIfNotConcrete(realm).configurable === false) {
        // i. Append key as an element of targetNonconfigurableKeys.
        targetNonconfigurableKeys.push(key);
      } else {
        // c. Else,
        // i. Append key as an element of targetConfigurableKeys.
        targetConfigurableKeys.push(key);
      }
    }

    // 15. If extensibleTarget is true and targetNonconfigurableKeys is empty, then
    if (extensibleTarget && !targetNonconfigurableKeys.length) {
      // a. Return trapResult.
      return trapResult;
    }

    // 16. Let uncheckedResultKeys be a new List which is a copy of trapResult.
    let uncheckedResultKeys = trapResult.slice();

    // 17. Repeat, for each key that is an element of targetNonconfigurableKeys,
    for (let key of targetNonconfigurableKeys) {
      // a. If key is not an element of uncheckedResultKeys, throw a TypeError exception.
      let index = FindPropertyKey(realm, uncheckedResultKeys, key);
      if (index < 0) {
        throw realm.createErrorThrowCompletion(
          realm.intrinsics.TypeError,
          "key is not an element of uncheckedResultKeys"
        );
      }

      // b. Remove key from uncheckedResultKeys.
      uncheckedResultKeys.splice(index, 1);
    }

    // 18. If extensibleTarget is true, return trapResult.
    if (extensibleTarget) return trapResult;

    // 19. Repeat, for each key that is an element of targetConfigurableKeys,
    for (let key of targetConfigurableKeys) {
      // a. If key is not an element of uncheckedResultKeys, throw a TypeError exception.
      let index = FindPropertyKey(realm, uncheckedResultKeys, key);
      if (index < 0) {
        throw realm.createErrorThrowCompletion(
          realm.intrinsics.TypeError,
          "key is not an element of uncheckedResultKeys"
        );
      }

      // b. Remove key from uncheckedResultKeys.
      uncheckedResultKeys.splice(index, 1);
    }

    // 20. If uncheckedResultKeys is not empty, throw a TypeError exception.
    if (uncheckedResultKeys.length) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 21. Return trapResult.
    return trapResult;
  }
}
