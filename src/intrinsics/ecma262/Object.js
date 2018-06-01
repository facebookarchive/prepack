/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { ValuesDomain } from "../../domains/index.js";
import { FatalError } from "../../errors.js";
import { Realm } from "../../realm.js";
import { NativeFunctionValue } from "../../values/index.js";
import { AbruptCompletion, PossiblyNormalCompletion } from "../../completions.js";
import {
  AbstractValue,
  AbstractObjectValue,
  ArrayValue,
  ObjectValue,
  NullValue,
  UndefinedValue,
  StringValue,
  BooleanValue,
  SymbolValue,
  Value,
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
    return To.ToObject(realm, value);
  });

  // ECMA262 19.1.2.1
  if (!realm.isCompatibleWith(realm.MOBILE_JSC_VERSION) && !realm.isCompatibleWith("mobile")) {
    let ObjectAssign = func.defineNativeMethod("assign", 2, (context, [target, ...sources]) => {
      // 1. Let to be ? ToObject(target).
      let to = To.ToObject(realm, target);
      let to_must_be_partial = false;

      // 2. If only one argument was passed, return to.
      if (!sources.length) return to;

      // 3. Let sources be the List of argument values starting with the second argument.
      sources;
      let delayedSources = [];

      const handleSnapshot = (frm, frm_was_partial) => {
        if (to_must_be_partial) {
          if (to instanceof AbstractObjectValue && to.values.isTop()) {
            // We don't know which objects to make partial and making all objects partial is failure in itself
            AbstractValue.reportIntrospectionError(to);
            throw new FatalError();
          } else {
            // if to has properties, we better remove them because after the temporal call to Object.assign we don't know their values anymore
            if (to.hasStringOrSymbolProperties()) {
              // preserve them in a snapshot and add the snapshot to the sources
              delayedSources.push(to.getSnapshot({ removeProperties: true }));
            }

            if (frm_was_partial) {
              if (frm instanceof AbstractObjectValue && frm.kind === "explicit conversion to object") {
                // Make it implicit again since it is getting delayed into an Object.assign call.
                delayedSources.push(frm.args[0]);
              } else {
                let frmSnapshot = frm.getSnapshot();
                frm.temporalAlias = frmSnapshot;
                frm.makePartial();
                delayedSources.push(frmSnapshot);
              }
            }
          }
        }
      };

      const applySource = nextSource => {
        let keys, frm;

        // a. If nextSource is undefined or null, let keys be a new empty List.
        if (HasSomeCompatibleType(nextSource, NullValue, UndefinedValue)) return;

        // b. Else,
        // i. Let from be ToObject(nextSource).
        frm = To.ToObject(realm, nextSource);

        // ii. Let keys be ? from.[[OwnPropertyKeys]]().
        let frm_was_partial = frm.isPartialObject();
        if (frm_was_partial) {
          if (!to.isSimpleObject() || !frm.isSimpleObject()) {
            // If an object is not a simple object, it may have getters on it that can
            // mutate any state as a result. We don't yet support this.
            AbstractValue.reportIntrospectionError(nextSource);
            throw new FatalError();
          }

          to_must_be_partial = true;
          // Make this temporarily not partial
          // so that we can call frm.$OwnPropertyKeys below.
          frm.makeNotPartial();
        }
        keys = frm.$OwnPropertyKeys();

        handleSnapshot(frm, frm_was_partial);

        // c. Repeat for each element nextKey of keys in List order,
        invariant(frm, "from required");
        invariant(keys, "keys required");
        copyKeys(keys, frm, to);
      };

      const tryAndApplySourceOrRecover = nextSource => {
        let effects;
        let savedSuppressDiagnostics = realm.suppressDiagnostics;
        try {
          realm.suppressDiagnostics = true;
          effects = realm.evaluateForEffects(
            () => {
              applySource(nextSource);
              return realm.intrinsics.undefined;
            },
            undefined,
            "tryAndApplySourceOrRecover"
          );
        } catch (e) {
          let frm = To.ToObject(realm, nextSource);
          let validFrom = frm.mightNotBeHavocedObject();
          let validTo = to.isSimpleObject();

          if (
            e instanceof FatalError &&
            validFrom &&
            validTo &&
            frm !== realm.intrinsics.null &&
            frm !== realm.intrinsics.undefined
          ) {
            let frm_was_partial = frm.isPartialObject();

            if (frm_was_partial) {
              to_must_be_partial = true;
            }
            handleSnapshot(frm, frm_was_partial);
            return;
          }
          throw e;
        } finally {
          realm.suppressDiagnostics = savedSuppressDiagnostics;
        }
        // Note that the effects of (non joining) abrupt branches are not included
        // in effects, but are tracked separately inside completion.
        realm.applyEffects(effects);
        let completion = effects.result;
        if (completion instanceof PossiblyNormalCompletion) {
          // in this case one of the branches may complete abruptly, which means that
          // not all control flow branches join into one flow at this point.
          // Consequently we have to continue tracking changes until the point where
          // all the branches come together into one.
          completion = realm.composeWithSavedCompletion(completion);
        }
        // return or throw completion
        if (completion instanceof AbruptCompletion) throw completion;
      };

      // 4. For each element nextSource of sources, in ascending index order,
      for (let nextSource of sources) {
        if (realm.isInPureScope()) {
          tryAndApplySourceOrRecover(nextSource);
        } else {
          applySource(nextSource);
        }
      }

      // 5. Return to.
      if (to_must_be_partial) {
        // if to has properties, we copy and delay them (at this stage we do not need to remove them)
        if (to.hasStringOrSymbolProperties()) {
          let toSnapshot = to.getSnapshot();
          delayedSources.push(toSnapshot);
        }

        to.makePartial();

        // We already established above that to is simple,
        // but now that it is partial we need to set the _isSimple flag.
        to.makeSimple();

        // Tell serializer that it may add properties to to only after temporalTo has been emitted
        let temporalTo = AbstractValue.createTemporalFromBuildFunction(
          realm,
          ObjectValue,
          [ObjectAssign, to, ...delayedSources],
          ([methodNode, targetNode, ...sourceNodes]: Array<BabelNodeExpression>) => {
            return t.callExpression(methodNode, [targetNode, ...sourceNodes]);
          },
          { skipInvariant: true }
        );
        invariant(temporalTo instanceof AbstractObjectValue);
        if (to instanceof AbstractObjectValue) {
          temporalTo.values = to.values;
        } else {
          invariant(to instanceof ObjectValue);
          temporalTo.values = new ValuesDomain(to);
        }
        to.temporalAlias = temporalTo;
      }
      return to;
    });

    function copyKeys(keys, from, to) {
      // c. Repeat for each element nextKey of keys in List order,
      for (let nextKey of keys) {
        // i. Let desc be ? from.[[GetOwnProperty]](nextKey).
        let desc = from.$GetOwnProperty(nextKey);

        // ii. If desc is not undefined and desc.[[Enumerable]] is true, then
        if (desc && desc.enumerable) {
          Props.ThrowIfMightHaveBeenDeleted(desc.value);

          // 1. Let propValue be ? Get(from, nextKey).
          let propValue = Get(realm, from, nextKey);

          // 2. Perform ? Set(to, nextKey, propValue, true).
          Props.Set(realm, to, nextKey, propValue, true);
        }
      }
    }
  }

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
  let getOwnPropertyDescriptor = func.defineNativeMethod("getOwnPropertyDescriptor", 2, (context, [O, P]) => {
    // 1. Let obj be ? ToObject(O).
    let obj = To.ToObject(realm, O);

    // 2. Let key be ? ToPropertyKey(P).
    let key = To.ToPropertyKey(realm, P.throwIfNotConcrete());

    // 3. Let desc be ? obj.[[GetOwnProperty]](key).
    let desc = obj.$GetOwnProperty(key);

    let getterFunc = desc && desc.get;
    // If we are returning a descriptor with a NativeFunctionValue
    // and it has no intrinsic name, then we create a temporal as this
    // can only be done at runtime
    if (
      getterFunc instanceof NativeFunctionValue &&
      getterFunc.intrinsicName === undefined &&
      realm.useAbstractInterpretation
    ) {
      invariant(P instanceof Value);
      // this will create a property descriptor at runtime
      let result = AbstractValue.createTemporalFromBuildFunction(
        realm,
        ObjectValue,
        [getOwnPropertyDescriptor, obj, P],
        ([methodNode, objNode, keyNode]) => t.callExpression(methodNode, [objNode, keyNode])
      );
      invariant(result instanceof AbstractObjectValue);
      result.makeSimple();
      let get = Get(realm, result, "get");
      let set = Get(realm, result, "set");
      invariant(get instanceof AbstractValue);
      invariant(set instanceof AbstractValue);
      desc = {
        get,
        set,
        enumerable: false,
        configurable: true,
      };
    }

    // 4. Return FromPropertyDescriptor(desc).
    let propDesc = Props.FromPropertyDescriptor(realm, desc);

    return propDesc;
  });

  // ECMA262 19.1.2.7
  func.defineNativeMethod("getOwnPropertyNames", 1, (context, [O]) => {
    // 1. Return ? GetOwnPropertyKeys(O, String).
    return GetOwnPropertyKeys(realm, O, StringValue);
  });

  // ECMA262 19.1.2.8
  func.defineNativeMethod("getOwnPropertyDescriptors", 1, (context, [O]) => {
    // 1. Let obj be ? ToObject(O).
    let obj = To.ToObject(realm, O);

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
  if (!realm.isCompatibleWith(realm.MOBILE_JSC_VERSION) && !realm.isCompatibleWith("mobile"))
    func.defineNativeMethod("getOwnPropertySymbols", 1, (context, [O]) => {
      // Return ? GetOwnPropertyKeys(O, Symbol).
      return GetOwnPropertyKeys(realm, O, SymbolValue);
    });

  // ECMA262 19.1.2.10
  func.defineNativeMethod("getPrototypeOf", 1, (context, [O]) => {
    // 1. Let obj be ? ToObject(O).
    let obj = To.ToObject(realm, O);

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
  let objectKeys = func.defineNativeMethod("keys", 1, (context, [O]) => {
    // 1. Let obj be ? ToObject(O).
    let obj = To.ToObject(realm, O);

    // If we're in pure scope and the items are completely abstract,
    // then create an abstract temporal with an array kind
    if (realm.isInPureScope() && obj instanceof AbstractObjectValue) {
      let array = ArrayValue.createTemporalWithWidenedNumericProperty(
        realm,
        [objectKeys, obj],
        ([methodNode, objNode]) => t.callExpression(methodNode, [objNode])
      );
      return array;
    } else if (ArrayValue.isIntrinsicAndHasWidenedNumericProperty(obj)) {
      return ArrayValue.createTemporalWithWidenedNumericProperty(realm, [objectKeys, obj], ([methodNode, objNode]) =>
        t.callExpression(methodNode, [objNode])
      );
    }

    // 2. Let nameList be ? EnumerableOwnProperties(obj, "key").
    let nameList = EnumerableOwnProperties(realm, obj.throwIfNotConcreteObject(), "key");

    // 3. Return CreateArrayFromList(nameList).
    return Create.CreateArrayFromList(realm, nameList);
  });

  // ECMA262 9.1.2.16
  if (!realm.isCompatibleWith(realm.MOBILE_JSC_VERSION) && !realm.isCompatibleWith("mobile")) {
    let objectValues = func.defineNativeMethod("values", 1, (context, [O]) => {
      // 1. Let obj be ? ToObject(O).
      let obj = To.ToObject(realm, O);

      if (realm.isInPureScope()) {
        // If we're in pure scope and the items are completely abstract,
        // then create an abstract temporal with an array kind
        if (obj instanceof AbstractObjectValue) {
          let array = ArrayValue.createTemporalWithWidenedNumericProperty(
            realm,
            [objectValues, obj],
            ([methodNode, objNode]) => t.callExpression(methodNode, [objNode])
          );
          return array;
        } else if (ArrayValue.isIntrinsicAndHasWidenedNumericProperty(obj)) {
          return ArrayValue.createTemporalWithWidenedNumericProperty(
            realm,
            [objectValues, obj],
            ([methodNode, objNode]) => t.callExpression(methodNode, [objNode])
          );
        }
      }

      // 2. Let nameList be ? EnumerableOwnProperties(obj, "value").
      let nameList = EnumerableOwnProperties(realm, obj.throwIfNotConcreteObject(), "value");

      // 3. Return CreateArrayFromList(nameList).
      return Create.CreateArrayFromList(realm, nameList);
    });
  }

  // ECMA262 19.1.2.17
  if (!realm.isCompatibleWith(realm.MOBILE_JSC_VERSION) && !realm.isCompatibleWith("mobile")) {
    let objectEntries = func.defineNativeMethod("entries", 1, (context, [O]) => {
      // 1. Let obj be ? ToObject(O).
      let obj = To.ToObject(realm, O);

      // If we're in pure scope and the items are completely abstract,
      // then create an abstract temporal with an array kind
      if (realm.isInPureScope() && obj instanceof AbstractObjectValue) {
        let array = ArrayValue.createTemporalWithWidenedNumericProperty(
          realm,
          [objectEntries, obj],
          ([methodNode, objNode]) => t.callExpression(methodNode, [objNode])
        );
        return array;
      } else if (ArrayValue.isIntrinsicAndHasWidenedNumericProperty(obj)) {
        return ArrayValue.createTemporalWithWidenedNumericProperty(
          realm,
          [objectEntries, obj],
          ([methodNode, objNode]) => t.callExpression(methodNode, [objNode])
        );
      }

      // 2. Let nameList be ? EnumerableOwnProperties(obj, "key+value").
      let nameList = EnumerableOwnProperties(realm, obj.throwIfNotConcreteObject(), "key+value");

      // 3. Return CreateArrayFromList(nameList).
      return Create.CreateArrayFromList(realm, nameList);
    });
  }

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
