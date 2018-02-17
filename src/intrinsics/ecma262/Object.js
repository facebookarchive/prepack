/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { FatalError } from "../../errors.js";
import { Realm } from "../../realm.js";
import { NativeFunctionValue } from "../../values/index.js";
import {
  AbstractValue,
  ObjectValue,
  NullValue,
  UndefinedValue,
  StringValue,
  BooleanValue,
  SymbolValue,
} from "../../values/index.js";
import {
  IsExtensible,
  EnumerableOwnProperties,
  GetOwnPropertyKeys,
  Get,
  RequireObjectCoercible,
  SameValuePartial,
  TestIntegrityLevel,
  SetIntegrityLevel,
  HasSomeCompatibleType,
} from "../../methods/index.js";
import { Create, Properties as Props, To } from "../../singletons.js";
import type { BabelNodeExpression } from "babel-types";
import * as t from "babel-types";
import invariant from "../../invariant.js";

export default function(realm: Realm): NativeFunctionValue {
  // ECMA262 19.1.1.1
  let func = new NativeFunctionValue(realm, "Object", "Object", 1, (context, [value], argCount, NewTarget) => {
    // 1. If NewTarget is neither undefined nor the active function, then
    if (NewTarget && NewTarget !== func) {
      // a. Return ? OrdinaryCreateFromConstructor(NewTarget, "%ObjectPrototype%").
      return Create.OrdinaryCreateFromConstructor(realm, NewTarget, "ObjectPrototype");
    }

    // 2. If value is null, undefined or not supplied, return ObjectCreate(%ObjectPrototype%).
    if (HasSomeCompatibleType(value, NullValue, UndefinedValue)) {
      return Create.ObjectCreate(realm, realm.intrinsics.ObjectPrototype);
    }

    // 3. Return ToObject(value).
    return To.ToObjectPartial(realm, value);
  });

  // ECMA262 19.1.2.1
  let ObjectAssign = func.defineNativeMethod("assign", 2, (context, [target, ...sources]) => {
    // 1. Let to be ? ToObject(target).
    let to = To.ToObjectPartial(realm, target);
    let to_must_be_partial = false;

    // 2. If only one argument was passed, return to.
    if (!sources.length) return to;

    // 3. Let sources be the List of argument values starting with the second argument.
    sources;

    // 4. For each element nextSource of sources, in ascending index order,
    for (let nextSource of sources) {
      let keys, frm;

      // a. If nextSource is undefined or null, let keys be a new empty List.
      if (HasSomeCompatibleType(nextSource, NullValue, UndefinedValue)) {
        continue;
      } else {
        // b. Else,
        // i. Let from be ToObject(nextSource).
        frm = To.ToObjectPartial(realm, nextSource);

        if (to_must_be_partial) {
          // We don't currently support more than one simple partial source.
          AbstractValue.reportIntrospectionError(nextSource);
          throw new FatalError();
        }

        let frm_was_partial = frm.isPartialObject();
        if (frm_was_partial) {
          if (!frm.isSimpleObject()) {
            // If this is not a simple object, it may have getters on it that can
            // mutate any state as a result. We don't yet support this.
            AbstractValue.reportIntrospectionError(nextSource);
            throw new FatalError();
          }

          // Generate a residual Object.assign call that copies the
          // partial properties that we don't know about.
          AbstractValue.createTemporalFromBuildFunction(
            realm,
            ObjectValue,
            [ObjectAssign, target, nextSource],
            ([methodNode, targetNode, sourceNode]: Array<BabelNodeExpression>) => {
              return t.callExpression(methodNode, [targetNode, sourceNode]);
            }
          );

          to_must_be_partial = true;
          frm.makeNotPartial();
        }

        // ii. Let keys be ? from.[[OwnPropertyKeys]]().
        keys = frm.$OwnPropertyKeys();
        if (frm_was_partial) frm.makePartial();
      }
      if (to_must_be_partial) {
        // Only OK if to is an empty object because nextSource might have
        // properties at runtime that will overwrite current properties in to.
        // For now, just throw if this happens.
        let to_keys = to.$OwnPropertyKeys();
        if (to_keys.length !== 0) {
          AbstractValue.reportIntrospectionError(nextSource);
          throw new FatalError();
        }
      }

      invariant(frm, "from required");
      invariant(keys, "keys required");

      // c. Repeat for each element nextKey of keys in List order,
      for (let nextKey of keys) {
        // i. Let desc be ? from.[[GetOwnProperty]](nextKey).
        let desc = frm.$GetOwnProperty(nextKey);

        // ii. If desc is not undefined and desc.[[Enumerable]] is true, then
        if (desc && desc.enumerable) {
          Props.ThrowIfMightHaveBeenDeleted(desc.value);

          // 1. Let propValue be ? Get(from, nextKey).
          let propValue = Get(realm, frm, nextKey);

          // 2. Perform ? Set(to, nextKey, propValue, true).
          Props.Set(realm, to, nextKey, propValue, true);
        }
      }
    }

    // 5. Return to.
    if (to_must_be_partial) {
      // We allow partial simple sources (and make `to` partial)
      // only if `to` has no keys. Therefore, it must also be simple.
      invariant(to.isSimpleObject());

      to.makePartial();

      // Partial objects (and `to` is now partial) can't be calculated to be
      // simple because we can't iterate over all of their properties.
      // We already established above that `to` is simple,
      // so set the `_isSimple` flag.
      to.makeSimple();

      if (to instanceof ObjectValue) {
        // At this point any further mutations to the target would be unsafe
        // because the Object.assign() call operates on the snapshot of the
        // object at this point in time. We can't mutate that snapshot.
        to.makeFinal();
      }
    }
    return to;
  });

  // ECMA262 19.1.2.2
  func.defineNativeMethod("create", 2, (context, [O, Properties]) => {
    // 1. If Type(O) is neither Object nor Null, throw a TypeError exception.
    if (!HasSomeCompatibleType(O, ObjectValue, NullValue)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 2. Let obj be ObjectCreate(O).
    let obj = Create.ObjectCreate(realm, ((O.throwIfNotConcrete(): any): ObjectValue | NullValue));

    // 3. If Properties is not undefined, then
    if (!Properties.mightBeUndefined()) {
      // a. Return ? ObjectDefineProperties(obj, Properties).
      return Props.ObjectDefineProperties(realm, obj, Properties);
    }
    Properties.throwIfNotConcrete();

    // 4. Return obj.
    return obj;
  });

  // ECMA262 19.1.2.3
  func.defineNativeMethod("defineProperties", 2, (context, [O, Properties]) => {
    // 1. Return ? ObjectDefineProperties(O, Properties).
    return Props.ObjectDefineProperties(realm, O, Properties);
  });

  // ECMA262 19.1.2.4
  func.defineNativeMethod("defineProperty", 3, (context, [O, P, Attributes]) => {
    // 1. If Type(O) is not Object, throw a TypeError exception.
    if (!O.mightBeObject()) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }
    O = O.throwIfNotObject();

    // 2. Let key be ? ToPropertyKey(P).
    let key = To.ToPropertyKey(realm, P.throwIfNotConcrete());

    // 3. Let desc be ? ToPropertyDescriptor(Attributes).
    let desc = To.ToPropertyDescriptor(realm, Attributes);

    // 4. Perform ? DefinePropertyOrThrow(O, key, desc).
    Props.DefinePropertyOrThrow(realm, (O: any), key, desc);

    // 4. Return O.
    return O;
  });

  // ECMA262 19.1.2.5
  func.defineNativeMethod("freeze", 1, (context, [O]) => {
    // 1. If Type(O) is not Object, return O.
    if (!O.mightBeObject()) return O;

    // 2. Let status be ? SetIntegrityLevel(O, "frozen").
    O = O.throwIfNotConcreteObject();
    let status = SetIntegrityLevel(realm, O, "frozen");

    // 3. If status is false, throw a TypeError exception.
    if (status === false) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 4. Return O.
    return O;
  });

  // ECMA262 19.1.2.6
  func.defineNativeMethod("getOwnPropertyDescriptor", 2, (context, [O, P]) => {
    // 1. Let obj be ? ToObject(O).
    let obj = To.ToObjectPartial(realm, O);

    // 2. Let key be ? ToPropertyKey(P).
    let key = To.ToPropertyKey(realm, P.throwIfNotConcrete());

    // 3. Let desc be ? obj.[[GetOwnProperty]](key).
    let desc = obj.$GetOwnProperty(key);

    // 4. Return FromPropertyDescriptor(desc).
    return Props.FromPropertyDescriptor(realm, desc);
  });

  // ECMA262 19.1.2.7
  func.defineNativeMethod("getOwnPropertyNames", 1, (context, [O]) => {
    // 1. Return ? GetOwnPropertyKeys(O, String).
    return GetOwnPropertyKeys(realm, O, StringValue);
  });

  // ECMA262 19.1.2.8
  func.defineNativeMethod("getOwnPropertyDescriptors", 1, (context, [O]) => {
    // 1. Let obj be ? ToObject(O).
    let obj = To.ToObject(realm, O.throwIfNotConcrete());

    // 2. Let ownKeys be ? obj.[[OwnPropertyKeys]]().
    let ownKeys = obj.$OwnPropertyKeys();

    // 3. Let descriptors be ! ObjectCreate(%ObjectPrototype%).
    let descriptors = Create.ObjectCreate(realm, realm.intrinsics.ObjectPrototype);

    // 4. Repeat, for each element key of ownKeys in List order,
    for (let key of ownKeys) {
      // a. Let desc be ? obj.[[GetOwnProperty]](key).
      let desc = obj.$GetOwnProperty(key);
      if (desc !== undefined) Props.ThrowIfMightHaveBeenDeleted(desc.value);

      // b. Let descriptor be ! FromPropertyDescriptor(desc).
      let descriptor = Props.FromPropertyDescriptor(realm, desc);

      // c. If descriptor is not undefined, perform ! CreateDataProperty(descriptors, key, descriptor).
      if (!(descriptor instanceof UndefinedValue)) Create.CreateDataProperty(realm, descriptors, key, descriptor);
    }

    // 5. Return descriptors.
    return descriptors;
  });

  // ECMA262 19.1.2.9
  func.defineNativeMethod("getOwnPropertySymbols", 1, (context, [O]) => {
    // Return ? GetOwnPropertyKeys(O, Symbol).
    return GetOwnPropertyKeys(realm, O, SymbolValue);
  });

  // ECMA262 19.1.2.10
  func.defineNativeMethod("getPrototypeOf", 1, (context, [O]) => {
    // 1. Let obj be ? ToObject(O).
    let obj = To.ToObject(realm, O.throwIfNotConcrete());

    // 2. Return ? obj.[[GetPrototypeOf]]().
    return obj.$GetPrototypeOf();
  });

  // ECMA262 19.1.2.11
  func.defineNativeMethod("is", 2, (context, [value1, value2]) => {
    // 1. Return SameValue(value1, value2).
    return new BooleanValue(realm, SameValuePartial(realm, value1, value2));
  });

  // ECMA262 19.1.2.12
  func.defineNativeMethod("isExtensible", 1, (context, [O]) => {
    // 1. If Type(O) is not Object, return false.
    if (!O.mightBeObject()) return realm.intrinsics.false;
    O = O.throwIfNotObject();

    // 2. Return ? IsExtensible(O).
    return new BooleanValue(realm, IsExtensible(realm, O));
  });

  // ECMA262 19.1.2.13
  func.defineNativeMethod("isFrozen", 1, (context, [O]) => {
    // 1. If Type(O) is not Object, return true.
    if (!O.mightBeObject()) return realm.intrinsics.true;

    // 2. Return ? TestIntegrityLevel(O, "frozen").
    O = O.throwIfNotConcreteObject();
    return new BooleanValue(realm, TestIntegrityLevel(realm, O, "frozen"));
  });

  // ECMA262 19.1.2.14
  func.defineNativeMethod("isSealed", 1, (context, [O]) => {
    // 1. If Type(O) is not Object, return true.
    if (!O.mightBeObject()) return realm.intrinsics.true;

    // 2. Return ? TestIntegrityLevel(O, "sealed").
    O = O.throwIfNotConcreteObject();
    return new BooleanValue(realm, TestIntegrityLevel(realm, O, "sealed"));
  });

  // ECMA262 19.1.2.15
  func.defineNativeMethod("keys", 1, (context, [O]) => {
    // 1. Let obj be ? ToObject(O).
    let obj = To.ToObject(realm, O.throwIfNotConcrete());

    // 2. Let nameList be ? EnumerableOwnProperties(obj, "key").
    let nameList = EnumerableOwnProperties(realm, obj, "key");

    // 3. Return CreateArrayFromList(nameList).
    return Create.CreateArrayFromList(realm, nameList);
  });

  // ECMA262 9.1.2.16
  if (!realm.isCompatibleWith(realm.MOBILE_JSC_VERSION) && !realm.isCompatibleWith("mobile"))
    func.defineNativeMethod("values", 1, (context, [O]) => {
      // 1. Let obj be ? ToObject(O).
      let obj = To.ToObject(realm, O.throwIfNotConcrete());

      // 2. Let nameList be ? EnumerableOwnProperties(obj, "value").
      let nameList = EnumerableOwnProperties(realm, obj, "value");

      // 3. Return CreateArrayFromList(nameList).
      return Create.CreateArrayFromList(realm, nameList);
    });

  // ECMA262 19.1.2.17
  func.defineNativeMethod("entries", 1, (context, [O]) => {
    // 1. Let obj be ? ToObject(O).
    let obj = To.ToObject(realm, O.throwIfNotConcrete());

    // 2. Let nameList be ? EnumerableOwnProperties(obj, "key+value").
    let nameList = EnumerableOwnProperties(realm, obj, "key+value");

    // 3. Return CreateArrayFromList(nameList).
    return Create.CreateArrayFromList(realm, nameList);
  });

  // ECMA262 19.1.2.18
  func.defineNativeMethod("preventExtensions", 1, (context, [O]) => {
    // 1. If Type(O) is not Object, return O.
    if (!O.mightBeObject()) return O;

    // 2. Let status be ? O.[[PreventExtensions]]().
    O = O.throwIfNotConcreteObject();
    let status = O.$PreventExtensions();

    // 3. If status is false, throw a TypeError exception.
    if (status === false) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 4. Return O.
    return O;
  });

  // ECMA262 19.1.2.19
  func.defineNativeMethod("seal", 1, (context, [O]) => {
    // 1. If Type(O) is not Object, return O.
    if (!O.mightBeObject()) return O;

    // 2. Let status be ? SetIntegrityLevel(O, "sealed").
    O = O.throwIfNotConcreteObject();
    let status = SetIntegrityLevel(realm, O, "sealed");

    // 3. If status is false, throw a TypeError exception.
    if (status === false) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 4. Return O.
    return O;
  });

  // ECMA262 19.1.2.20
  if (!realm.isCompatibleWith(realm.MOBILE_JSC_VERSION) && !realm.isCompatibleWith("mobile"))
    func.defineNativeMethod("setPrototypeOf", 2, (context, [O, proto]) => {
      // 1. Let O be ? RequireObjectCoercible(O).
      O = RequireObjectCoercible(realm, O);

      // 2. If Type(proto) is neither Object nor Null, throw a TypeError exception.
      if (!HasSomeCompatibleType(proto, ObjectValue, NullValue)) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
      }

      // 3. If Type(O) is not Object, return O.
      O = O.throwIfNotConcrete();
      if (!(O instanceof ObjectValue)) return O;

      // 4. Let status be ? O.[[SetPrototypeOf]](proto).
      let status = O.$SetPrototypeOf(((proto: any): ObjectValue | NullValue));

      // 5. If status is false, throw a TypeError exception.
      if (status === false) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
      }

      // 6. Return O.
      return O;
    });

  return func;
}
