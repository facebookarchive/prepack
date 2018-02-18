/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { AbruptCompletion, PossiblyNormalCompletion } from "../completions.js";
import { construct_empty_effects, type Realm } from "../realm.js";
import type { Descriptor, PropertyBinding, PropertyKeyValue } from "../types.js";
import {
  AbstractObjectValue,
  AbstractValue,
  ArrayValue,
  BooleanValue,
  ConcreteValue,
  NullValue,
  NumberValue,
  ObjectValue,
  StringValue,
  SymbolValue,
  UndefinedValue,
  Value,
} from "../values/index.js";
import { EvalPropertyName } from "../evaluators/ObjectExpression";
import { EnvironmentRecord, Reference } from "../environment.js";
import { FatalError } from "../errors.js";
import invariant from "../invariant.js";
import {
  Call,
  cloneDescriptor,
  equalDescriptors,
  Get,
  GetGlobalObject,
  GetThisValue,
  HasSomeCompatibleType,
  IsAccessorDescriptor,
  IsDataDescriptor,
  IsGenericDescriptor,
  IsPropertyKey,
  MakeConstructor,
  SameValue,
  SameValuePartial,
} from "../methods/index.js";
import { type BabelNodeObjectMethod, type BabelNodeClassMethod, isValidIdentifier } from "babel-types";
import type { LexicalEnvironment } from "../environment.js";
import { Create, Environment, Functions, Join, Leak, Path, To } from "../singletons.js";
import IsStrict from "../utils/strict.js";
import * as t from "babel-types";

function StringKey(key: PropertyKeyValue): string {
  if (key instanceof StringValue) key = key.value;
  if (typeof key !== "string") {
    // The generator currently only supports string keys.
    throw new FatalError();
  }
  return key;
}

function InternalDescriptorPropertyToValue(realm: Realm, value: void | boolean | Value) {
  if (value === undefined) return realm.intrinsics.undefined;
  if (typeof value === "boolean") return new BooleanValue(realm, value);
  invariant(value instanceof Value);
  return value;
}

function InternalGetPropertiesKey(P: PropertyKeyValue): string | SymbolValue | void {
  if (typeof P === "string") {
    return P;
  } else if (P instanceof StringValue) {
    return P.value;
  } else if (P instanceof SymbolValue) {
    return P;
  }
  // otherwise, undefined
}

function InternalGetPropertiesMap(O: ObjectValue, P: PropertyKeyValue): Map<any, PropertyBinding> {
  if (typeof P === "string" || P instanceof StringValue) {
    return O.properties;
  } else if (P instanceof SymbolValue) {
    return O.symbols;
  } else {
    invariant(false);
  }
}

function InternalSetProperty(realm: Realm, O: ObjectValue, P: PropertyKeyValue, desc: Descriptor) {
  let map = InternalGetPropertiesMap(O, P);
  let key = InternalGetPropertiesKey(P);
  let propertyBinding = map.get(key);
  if (propertyBinding === undefined) {
    propertyBinding = { descriptor: undefined, object: O, key: key };
    map.set(key, propertyBinding);
  }
  realm.recordModifiedProperty(propertyBinding);
  propertyBinding.descriptor = desc;
}

function InternalUpdatedProperty(realm: Realm, O: ObjectValue, P: PropertyKeyValue, oldDesc?: Descriptor) {
  let generator = realm.generator;
  if (!generator) return;
  if (!O.isIntrinsic()) return;
  if (P instanceof SymbolValue) return;
  if (P instanceof StringValue) P = P.value;
  invariant(!O.isLeakedObject()); // leaked objects are never updated
  invariant(!O.isFinalObject()); // final objects are never updated
  invariant(typeof P === "string");
  let propertyBinding = InternalGetPropertiesMap(O, P).get(P);
  invariant(propertyBinding !== undefined); // The callers ensure this
  let desc = propertyBinding.descriptor;
  if (desc === undefined) {
    // The property is being deleted
    if (O === realm.$GlobalObject) {
      generator.emitGlobalDelete(P, realm.getRunningContext().isStrict);
    } else {
      generator.emitPropertyDelete(O, P);
    }
  } else {
    let descValue = desc.value || realm.intrinsics.undefined;
    invariant(descValue instanceof Value);
    if (oldDesc === undefined) {
      // The property is being created
      if (O === realm.$GlobalObject) {
        if (IsDataDescriptor(realm, desc)) {
          if (isValidIdentifier(P) && !desc.configurable && desc.enumerable && desc.writable) {
            generator.emitGlobalDeclaration(P, descValue);
          } else if (desc.configurable && desc.enumerable && desc.writable) {
            generator.emitGlobalAssignment(P, descValue, realm.getRunningContext().isStrict);
          } else {
            generator.emitDefineProperty(O, P, desc);
          }
        } else {
          generator.emitDefineProperty(O, P, desc);
        }
      } else {
        if (IsDataDescriptor(realm, desc) && desc.configurable && desc.enumerable && desc.writable) {
          generator.emitPropertyAssignment(O, P, descValue);
        } else {
          generator.emitDefineProperty(O, P, desc);
        }
      }
    } else {
      // The property is being modified
      if (equalDescriptors(desc, oldDesc)) {
        // only the value is being modified
        if (O === realm.$GlobalObject) {
          generator.emitGlobalAssignment(P, descValue, realm.getRunningContext().isStrict);
        } else {
          generator.emitPropertyAssignment(O, P, descValue);
        }
      } else {
        generator.emitDefineProperty(O, P, desc, /*isDescChanged*/ true);
      }
    }
  }
}

function leakDescriptor(realm: Realm, desc: Descriptor) {
  if (desc.value) {
    invariant(desc.value instanceof Value, "internal fields should not leak");
    Leak.leakValue(realm, desc.value);
  }
  if (desc.get) {
    Leak.leakValue(realm, desc.get);
  }
  if (desc.set) {
    Leak.leakValue(realm, desc.set);
  }
}

// Determines if an object with parent O may create its own property P.
function parentPermitsChildPropertyCreation(realm: Realm, O: ObjectValue, P: PropertyKeyValue): boolean {
  let ownDesc = O.$GetOwnProperty(P);
  let ownDescValue = !ownDesc
    ? realm.intrinsics.undefined
    : ownDesc.value === undefined ? realm.intrinsics.undefined : ownDesc.value;
  invariant(ownDescValue instanceof Value);

  if (!ownDesc || ownDescValue.mightHaveBeenDeleted()) {
    // O might not object, so first ask its parent
    let parent = O.$GetPrototypeOf();
    parent.throwIfNotConcrete(); //TODO #1016: deal with abstract parents
    if (!(parent instanceof NullValue)) {
      if (!parentPermitsChildPropertyCreation(realm, parent, P)) return false;
    }

    // Parent is OK, so if O does not object return true
    if (!ownDesc) return true; // O has no opinion of its ownDesc
  }
  invariant(ownDesc !== undefined);

  // O might have a property P and so might object
  if (IsDataDescriptor(realm, ownDesc)) {
    if (ownDesc.writable) {
      // The grand parent does not object so it is OK that parent does not have P
      // If parent does have P, it is also OK because it is a writable data property
      return true;
    }
  }
  // If parent does not have property P, this is too pessimistic, but that is
  // the caller's problem.
  return false;
}

function ensureIsNotFinal(realm: Realm, O: ObjectValue, P: void | PropertyKeyValue) {
  if (!O.isFinalObject()) {
    return;
  }
  if (!realm.isInPureScope()) {
    // We can't continue because this object is already in its final state.
    AbstractValue.reportIntrospectionError(O, P);
    throw new FatalError();
  }
  // It's not safe to write to this object anymore because it's already
  // been used in a way that serializes its final state. We can, however,
  // leak it if we're in pure scope, and continue to emit assignments.
  Leak.leakValue(realm, O);
  if (O.isLeakedObject()) {
    return;
  }
  // The object was created outside of pure scope so we couldn't leak.
  // Give up.
  AbstractValue.reportIntrospectionError(O, P);
  throw new FatalError();
}

export class PropertiesImplementation {
  // ECMA262 9.1.9.1
  OrdinarySet(realm: Realm, O: ObjectValue, P: PropertyKeyValue, V: Value, Receiver: Value): boolean {
    ensureIsNotFinal(realm, O, P);
    if (!realm.ignoreLeakLogic && O.isLeakedObject()) {
      Leak.leakValue(realm, V);
      if (realm.generator) {
        realm.generator.emitPropertyAssignment(O, StringKey(P), V);
      }
      return true;
    }

    let weakDeletion = V.mightHaveBeenDeleted();

    // 1. Assert: IsPropertyKey(P) is true.
    invariant(IsPropertyKey(realm, P), "expected property key");

    // 2. Let ownDesc be ? O.[[GetOwnProperty]](P).
    let ownDesc;
    let existingBinding = InternalGetPropertiesMap(O, P).get(InternalGetPropertiesKey(P));
    if (existingBinding !== undefined || !(O.isPartialObject() && O.isSimpleObject())) ownDesc = O.$GetOwnProperty(P);
    let ownDescValue = !ownDesc
      ? realm.intrinsics.undefined
      : ownDesc.value === undefined ? realm.intrinsics.undefined : ownDesc.value;
    invariant(ownDescValue instanceof Value);

    // 3. If ownDesc is undefined (or might be), then
    if (!ownDesc || ownDescValue.mightHaveBeenDeleted()) {
      // a. Let parent be ? O.[[GetPrototypeOf]]().
      let parent = O.$GetPrototypeOf();
      parent.throwIfNotConcrete(); //TODO #1016: deal with abstract parents

      // b. If parent is not null, then
      if (!(parent instanceof NullValue)) {
        if (!ownDesc) {
          // i. Return ? parent.[[Set]](P, V, Receiver).
          return parent.$Set(P, V, Receiver);
        }
        // But since we don't know if O has its own property P, the parent might
        // actually have a say. Give up, unless the parent would be OK with it.
        if (!parentPermitsChildPropertyCreation(realm, parent, P)) {
          invariant(ownDescValue instanceof AbstractValue);
          AbstractValue.reportIntrospectionError(ownDescValue);
          throw new FatalError();
        }
        // Since the parent is OK with us creating a local property for O
        // we can carry on as if there were no parent.
      }

      // i. Let ownDesc be the PropertyDescriptor{[[Value]]: undefined, [[Writable]]: true, [[Enumerable]]: true, [[Configurable]]: true}.
      if (!ownDesc)
        ownDesc = ({
          value: realm.intrinsics.undefined,
          writable: true,
          enumerable: true,
          configurable: true,
        }: any);
    }

    // joined descriptors need special treatment
    let joinCondition = ownDesc.joinCondition;
    if (joinCondition !== undefined) {
      let descriptor2 = ownDesc.descriptor2;
      ownDesc = ownDesc.descriptor1;
      let [compl1, gen1, bindings1, properties1, createdObj1] = Path.withCondition(joinCondition, () => {
        return ownDesc !== undefined
          ? realm.evaluateForEffects(() => new BooleanValue(realm, OrdinarySetHelper()))
          : construct_empty_effects(realm);
      });
      ownDesc = descriptor2;
      let [compl2, gen2, bindings2, properties2, createdObj2] = Path.withInverseCondition(joinCondition, () => {
        return ownDesc !== undefined
          ? realm.evaluateForEffects(() => new BooleanValue(realm, OrdinarySetHelper()))
          : construct_empty_effects(realm);
      });

      // Join the effects, creating an abstract view of what happened, regardless
      // of the actual value of ownDesc.joinCondition.
      let joinedEffects = Join.joinEffects(
        realm,
        joinCondition,
        [compl1, gen1, bindings1, properties1, createdObj1],
        [compl2, gen2, bindings2, properties2, createdObj2]
      );
      let completion = joinedEffects[0];
      if (completion instanceof PossiblyNormalCompletion) {
        // in this case one of the branches may complete abruptly, which means that
        // not all control flow branches join into one flow at this point.
        // Consequently we have to continue tracking changes until the point where
        // all the branches come together into one.
        completion = realm.composeWithSavedCompletion(completion);
      }
      // Note that the effects of (non joining) abrupt branches are not included
      // in joinedEffects, but are tracked separately inside completion.
      realm.applyEffects(joinedEffects);

      // return or throw completion
      if (completion instanceof AbruptCompletion) throw completion;
      invariant(completion instanceof Value);
      return To.ToBooleanPartial(realm, completion);
    }

    return OrdinarySetHelper();

    function OrdinarySetHelper(): boolean {
      invariant(ownDesc !== undefined);
      invariant(ownDescValue instanceof Value);
      // 4. If IsDataDescriptor(ownDesc) is true, then
      if (IsDataDescriptor(realm, ownDesc)) {
        // a. If ownDesc.[[Writable]] is false, return false.
        if (!ownDesc.writable && !weakDeletion) {
          // The write will fail if the property actually exists
          if (ownDescValue.mightHaveBeenDeleted()) {
            // But maybe it does not and thus would succeed.
            // Since we don't know what will happen, give up for now.
            invariant(ownDescValue instanceof AbstractValue);
            AbstractValue.reportIntrospectionError(ownDescValue);
            throw new FatalError();
          }
          return false;
        }

        // b. If Type(Receiver) is not Object, return false.
        Receiver = Receiver.throwIfNotConcrete();
        if (!(Receiver instanceof ObjectValue)) return false;

        // c. Let existingDescriptor be ? Receiver.[[GetOwnProperty]](P).
        let existingDescriptor;
        let binding = InternalGetPropertiesMap(Receiver, P).get(InternalGetPropertiesKey(P));
        if (binding !== undefined || !(Receiver.isPartialObject() && Receiver.isSimpleObject()))
          existingDescriptor = Receiver.$GetOwnProperty(P);
        if (existingDescriptor !== undefined) {
          if (existingDescriptor.descriptor1 === ownDesc) existingDescriptor = ownDesc;
          else if (existingDescriptor.descriptor2 === ownDesc) existingDescriptor = ownDesc;
        }
        let existingDescValue = !existingDescriptor
          ? realm.intrinsics.undefined
          : existingDescriptor.value === undefined ? realm.intrinsics.undefined : existingDescriptor.value;
        invariant(existingDescValue instanceof Value);

        // d. If existingDescriptor is not undefined, then
        if (existingDescriptor !== undefined) {
          // i. If IsAccessorDescriptor(existingDescriptor) is true, return false.
          if (IsAccessorDescriptor(realm, existingDescriptor)) {
            invariant(
              !existingDescValue.mightHaveBeenDeleted(),
              "should not fail until weak deletes of accessors are suppported"
            );
            return false;
          }

          // ii. If existingDescriptor.[[Writable]] is false, return false.
          if (!existingDescriptor.writable && !(weakDeletion && existingDescriptor.configurable)) {
            // If we are not sure the receiver actually has a property P we can't just return false here.
            if (existingDescValue.mightHaveBeenDeleted()) {
              invariant(existingDescValue instanceof AbstractValue);
              AbstractValue.reportIntrospectionError(existingDescValue);
              throw new FatalError();
            }
            return false;
          }

          // iii. Let valueDesc be the PropertyDescriptor{[[Value]]: V}.
          let valueDesc = { value: V };

          // iv. Return ? Receiver.[[DefineOwnProperty]](P, valueDesc).
          if (weakDeletion || existingDescValue.mightHaveBeenDeleted()) {
            // At this point we are not actually sure that Receiver actually has
            // a property P, however, if it has, we are sure that its a data property,
            // and that redefining the property with valueDesc will not change the
            // attributes of the property, so we delete it to make things nice for $DefineOwnProperty.
            Receiver.$Delete(P);
            valueDesc = existingDescriptor;
            valueDesc.value = V;
          }
          return Receiver.$DefineOwnProperty(P, valueDesc);
        } else {
          // e. Else Receiver does not currently have a property P,

          // i. Return ? CreateDataProperty(Receiver, P, V).
          return Create.CreateDataProperty(realm, Receiver, P, V);
        }
      }

      // 5. Assert: IsAccessorDescriptor(ownDesc) is true.
      invariant(IsAccessorDescriptor(realm, ownDesc), "expected accessor");

      // 6. Let setter be ownDesc.[[Set]].
      let setter = "set" in ownDesc ? ownDesc.set : undefined;

      // 7. If setter is undefined, return false.
      if (!setter || setter instanceof UndefinedValue) return false;

      // 8. Perform ? Call(setter, Receiver, « V »).
      Call(realm, setter.throwIfNotConcrete(), Receiver, [V]);

      // 9. Return true.
      return true;
    }
  }

  // ECMA262 6.2.4.4
  FromPropertyDescriptor(realm: Realm, Desc: ?Descriptor): Value {
    // 1. If Desc is undefined, return undefined.
    if (!Desc) return realm.intrinsics.undefined;

    // 2. Let obj be ObjectCreate(%ObjectPrototype%).
    let obj = Create.ObjectCreate(realm, realm.intrinsics.ObjectPrototype);

    // 3. Assert: obj is an extensible ordinary object with no own properties.
    invariant(obj.getExtensible(), "expected an extensible object");
    invariant(!obj.properties.size, "expected an object with no own properties");

    // 4. If Desc has a [[Value]] field, then
    let success = true;
    if ("value" in Desc) {
      invariant(Desc.value instanceof Value);
      // a. Perform CreateDataProperty(obj, "value", Desc.[[Value]]).
      success = Create.CreateDataProperty(realm, obj, "value", Desc.value) && success;
    }

    // 5. If Desc has a [[Writable]] field, then
    if ("writable" in Desc) {
      invariant(Desc.writable !== undefined);
      // a. Perform CreateDataProperty(obj, "writable", Desc.[[Writable]]).
      success = Create.CreateDataProperty(realm, obj, "writable", new BooleanValue(realm, Desc.writable)) && success;
    }

    // 6. If Desc has a [[Get]] field, then
    if ("get" in Desc) {
      invariant(Desc.get !== undefined);
      // a. Perform CreateDataProperty(obj, "get", Desc.[[Get]]).
      success = Create.CreateDataProperty(realm, obj, "get", Desc.get) && success;
    }

    // 7. If Desc has a [[Set]] field, then
    if ("set" in Desc) {
      invariant(Desc.set !== undefined);
      // a. Perform CreateDataProperty(obj, "set", Desc.[[Set]]).
      success = Create.CreateDataProperty(realm, obj, "set", Desc.set) && success;
    }

    // 8. If Desc has an [[Enumerable]] field, then
    if ("enumerable" in Desc) {
      invariant(Desc.enumerable !== undefined);
      // a. Perform CreateDataProperty(obj, "enumerable", Desc.[[Enumerable]]).
      success =
        Create.CreateDataProperty(realm, obj, "enumerable", new BooleanValue(realm, Desc.enumerable)) && success;
    }

    // 9. If Desc has a [[Configurable]] field, then
    if ("configurable" in Desc) {
      invariant(Desc.configurable !== undefined);
      // a. Perform CreateDataProperty(obj, "configurable", Desc.[[Configurable]]).
      success =
        Create.CreateDataProperty(realm, obj, "configurable", new BooleanValue(realm, Desc.configurable)) && success;
    }

    // 10. Assert: all of the above CreateDataProperty operations return true.
    invariant(success, "fails to create data property");

    // 11. Return obj.
    return obj;
  }

  //
  OrdinaryDelete(realm: Realm, O: ObjectValue, P: PropertyKeyValue): boolean {
    // 1. Assert: IsPropertyKey(P) is true.
    invariant(IsPropertyKey(realm, P), "expected a property key");

    // 2. Let desc be ? O.[[GetOwnProperty]](P).
    let desc = O.$GetOwnProperty(P);

    // 3. If desc is undefined, return true.
    if (!desc) {
      ensureIsNotFinal(realm, O, P);
      if (!realm.ignoreLeakLogic && O.isLeakedObject()) {
        if (realm.generator) {
          realm.generator.emitPropertyDelete(O, StringKey(P));
        }
      }
      return true;
    }

    // 4. If desc.[[Configurable]] is true, then
    if (desc.configurable) {
      ensureIsNotFinal(realm, O, P);
      if (O.isLeakedObject()) {
        if (realm.generator) {
          realm.generator.emitPropertyDelete(O, StringKey(P));
        }
        return true;
      }

      // a. Remove the own property with name P from O.
      let key = InternalGetPropertiesKey(P);
      let map = InternalGetPropertiesMap(O, P);
      let propertyBinding = map.get(key);
      invariant(propertyBinding !== undefined);
      realm.recordModifiedProperty(propertyBinding);
      propertyBinding.descriptor = undefined;
      InternalUpdatedProperty(realm, O, P, desc);

      // b. Return true.
      return true;
    }

    // 5. Return false.
    return false;
  }

  // ECMA262 7.3.8
  DeletePropertyOrThrow(realm: Realm, O: ObjectValue, P: PropertyKeyValue): boolean {
    // 1. Assert: Type(O) is Object.
    invariant(O instanceof ObjectValue, "expected an object");

    // 2. Assert: IsPropertyKey(P) is true.
    invariant(IsPropertyKey(realm, P), "expected a property key");

    // 3. Let success be ? O.[[Delete]](P).
    let success = O.$Delete(P);

    // 4. If success is false, throw a TypeError exception.
    if (!success) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError, "couldn't delete property");
    }

    // 5. Return success.
    return success;
  }

  // ECMA262 6.2.4.6
  CompletePropertyDescriptor(realm: Realm, Desc: Descriptor): Descriptor {
    // 1. Assert: Desc is a Property Descriptor.

    // 2. Let like be Record{[[Value]]: undefined, [[Writable]]: false, [[Get]]: undefined, [[Set]]: undefined, [[Enumerable]]: false, [[Configurable]]: false}.
    let like = {
      value: realm.intrinsics.undefined,
      get: realm.intrinsics.undefined,
      set: realm.intrinsics.undefined,
      writable: false,
      enumerable: false,
      configurable: false,
    };

    // 3. If either IsGenericDescriptor(Desc) or IsDataDescriptor(Desc) is true, then
    if (IsGenericDescriptor(realm, Desc) || IsDataDescriptor(realm, Desc)) {
      // a. If Desc does not have a [[Value]] field, set Desc.[[Value]] to like.[[Value]].
      if (!("value" in Desc)) Desc.value = like.value;
      // b. If Desc does not have a [[Writable]] field, set Desc.[[Writable]] to like.[[Writable]].
      if (!("writable" in Desc)) Desc.writable = like.writable;
    } else {
      // 4. Else,
      // a. If Desc does not have a [[Get]] field, set Desc.[[Get]] to like.[[Get]].
      if (!("get" in Desc)) Desc.get = like.get;
      // b. If Desc does not have a [[Set]] field, set Desc.[[Set]] to like.[[Set]].
      if (!("set" in Desc)) Desc.set = like.set;
    }

    // 5. If Desc does not have an [[Enumerable]] field, set Desc.[[Enumerable]] to like.[[Enumerable]].
    if (!("enumerable" in Desc)) Desc.enumerable = like.enumerable;

    // 6. If Desc does not have a [[Configurable]] field, set Desc.[[Configurable]] to like.[[Configurable]].
    if (!("configurable" in Desc)) Desc.configurable = like.configurable;

    // 7. Return Desc.
    return Desc;
  }

  // ECMA262 9.1.6.2
  IsCompatiblePropertyDescriptor(realm: Realm, extensible: boolean, Desc: Descriptor, current: ?Descriptor): boolean {
    // 1. Return ValidateAndApplyPropertyDescriptor(undefined, undefined, Extensible, Desc, Current).
    return this.ValidateAndApplyPropertyDescriptor(realm, undefined, undefined, extensible, Desc, current);
  }

  // ECMA262 9.1.6.3
  ValidateAndApplyPropertyDescriptor(
    realm: Realm,
    O: void | ObjectValue,
    P: void | PropertyKeyValue,
    extensible: boolean,
    Desc: Descriptor,
    current: ?Descriptor
  ): boolean {
    // 1. Assert: If O is not undefined, then IsPropertyKey(P) is true.
    if (O !== undefined) {
      invariant(P !== undefined);
      invariant(IsPropertyKey(realm, P));
    }

    if (current && current.joinCondition !== undefined) {
      let jc = current.joinCondition;
      if (Path.implies(jc)) current = current.descriptor1;
      else if (!AbstractValue.createFromUnaryOp(realm, "!", jc, true).mightNotBeTrue()) current = current.descriptor2;
    }

    // 2. If current is undefined, then
    if (!current) {
      // a. If extensible is false, return false.
      if (!extensible) return false;

      // b. Assert: extensible is true.
      invariant(extensible === true, "expected extensible to be true");

      if (O !== undefined && P !== undefined) {
        ensureIsNotFinal(realm, O, P);
        if (!realm.ignoreLeakLogic && O.isLeakedObject()) {
          leakDescriptor(realm, Desc);
          if (realm.generator) {
            realm.generator.emitDefineProperty(O, StringKey(P), Desc);
          }
          return true;
        }
      }

      // c. If IsGenericDescriptor(Desc) is true or IsDataDescriptor(Desc) is true, then
      if (IsGenericDescriptor(realm, Desc) || IsDataDescriptor(realm, Desc)) {
        // i. If O is not undefined, create an own data property named P of object O whose [[Value]],
        //    [[Writable]], [[Enumerable]] and [[Configurable]] attribute values are described by Desc. If the
        //    value of an attribute field of Desc is absent, the attribute of the newly created property is set
        //    to its default value.
        if (O !== undefined) {
          invariant(P !== undefined);
          InternalSetProperty(realm, O, P, {
            value: "value" in Desc ? Desc.value : realm.intrinsics.undefined,
            writable: "writable" in Desc ? Desc.writable : false,
            enumerable: "enumerable" in Desc ? Desc.enumerable : false,
            configurable: "configurable" in Desc ? Desc.configurable : false,
          });
          InternalUpdatedProperty(realm, O, P, undefined);
        }
      } else {
        // d. Else Desc must be an accessor Property Descriptor,
        // i. If O is not undefined, create an own accessor property named P of object O whose [[Get]],
        //    [[Set]], [[Enumerable]] and [[Configurable]] attribute values are described by Desc. If the value
        //    of an attribute field of Desc is absent, the attribute of the newly created property is set to its
        //    default value.
        if (O !== undefined) {
          invariant(P !== undefined);
          InternalSetProperty(realm, O, P, {
            get: "get" in Desc ? Desc.get : realm.intrinsics.undefined,
            set: "set" in Desc ? Desc.set : realm.intrinsics.undefined,
            enumerable: "enumerable" in Desc ? Desc.enumerable : false,
            configurable: "configurable" in Desc ? Desc.configurable : false,
          });
          InternalUpdatedProperty(realm, O, P, undefined);
        }
      }

      // e. Return true.
      return true;
    }
    this.ThrowIfMightHaveBeenDeleted(current.value);

    // 3. Return true, if every field in Desc is absent.
    if (!Object.keys(Desc).length) return true;

    // 4. Return true, if every field in Desc also occurs in current and the value of every field in Desc is the
    // same value as the corresponding field in current when compared using the SameValue algorithm.
    let identical = true;
    for (let field in Desc) {
      if (!(field in current)) {
        identical = false;
      } else {
        let dval = InternalDescriptorPropertyToValue(realm, Desc[field]);
        let cval = InternalDescriptorPropertyToValue(realm, current[field]);
        if (dval instanceof ConcreteValue && cval instanceof ConcreteValue) identical = SameValue(realm, dval, cval);
        else {
          identical = dval === cval;
          // This might be false now but true at runtime. This does not
          // matter because the logic for non identical values will still
          // do the right thing in the cases below that does not blow up
          // when dealing with an abstract value.
        }
      }
      if (!identical) break;
    }
    if (identical) {
      return true;
    }

    // 5. If the [[Configurable]] field of current is false, then
    if (!current.configurable) {
      // a. Return false, if the [[Configurable]] field of Desc is true.
      if (Desc.configurable) return false;

      // b. Return false, if the [[Enumerable]] field of Desc is present and the [[Enumerable]] fields of current and Desc are the Boolean negation of each other.
      if ("enumerable" in Desc && Desc.enumerable !== current.enumerable) {
        return false;
      }
    }

    if (O !== undefined && P !== undefined) {
      ensureIsNotFinal(realm, O, P);
      if (!realm.ignoreLeakLogic && O.isLeakedObject()) {
        leakDescriptor(realm, Desc);
        if (realm.generator) {
          realm.generator.emitDefineProperty(O, StringKey(P), Desc);
        }
        return true;
      }
    }

    let oldDesc = current;
    current = cloneDescriptor(current);
    invariant(current !== undefined);

    // 6. If IsGenericDescriptor(Desc) is true, no further validation is required.
    if (IsGenericDescriptor(realm, Desc)) {
    } else if (IsDataDescriptor(realm, current) !== IsDataDescriptor(realm, Desc)) {
      // 7. Else if IsDataDescriptor(current) and IsDataDescriptor(Desc) have different results, then
      // a. Return false, if the [[Configurable]] field of current is false.
      if (!current.configurable) return false;

      // b. If IsDataDescriptor(current) is true, then
      if (IsDataDescriptor(realm, current)) {
        // i. If O is not undefined, convert the property named P of object O from a data property to an accessor property.
        // Preserve the existing values of the converted property's [[Configurable]] and [[Enumerable]] attributes and set the rest of the property's attributes to their default values.
        if (O !== undefined) {
          invariant(P !== undefined);
          let key = InternalGetPropertiesKey(P);
          let propertyBinding = InternalGetPropertiesMap(O, P).get(key);
          invariant(propertyBinding !== undefined);
          delete current.writable;
          delete current.value;
          current.get = realm.intrinsics.undefined;
          current.set = realm.intrinsics.undefined;
        }
      } else {
        // c. Else,
        // i. If O is not undefined, convert the property named P of object O from an accessor property to a data property. Preserve the existing values of the converted property's [[Configurable]] and [[Enumerable]] attributes and set the rest of the property's attributes to their default values.
        if (O !== undefined) {
          invariant(P !== undefined);
          let key = InternalGetPropertiesKey(P);
          let propertyBinding = InternalGetPropertiesMap(O, P).get(key);
          invariant(propertyBinding !== undefined);
          delete current.get;
          delete current.set;
          current.writable = false;
          current.value = realm.intrinsics.undefined;
        }
      }
    } else if (IsDataDescriptor(realm, current) && IsDataDescriptor(realm, Desc)) {
      // 8. Else if IsDataDescriptor(current) and IsDataDescriptor(Desc) are both true, then
      // a. If the [[Configurable]] field of current is false, then
      if (!current.configurable) {
        // i. Return false, if the [[Writable]] field of current is false and the [[Writable]] field of Desc is true.
        if (!current.writable && Desc.writable) return false;

        // ii. If the [[Writable]] field of current is false, then
        if (!current.writable) {
          // 1. Return false, if the [[Value]] field of Desc is present and SameValue(Desc.[[Value]], current.[[Value]]) is false.
          let descValue = Desc.value || realm.intrinsics.undefined;
          invariant(descValue instanceof Value);
          let currentValue = current.value || realm.intrinsics.undefined;
          invariant(currentValue instanceof Value);
          if (Desc.value && !SameValuePartial(realm, descValue, currentValue)) {
            return false;
          }
        }
      } else {
        // b. Else the [[Configurable]] field of current is true, so any change is acceptable.
      }
    } else {
      // 9. Else IsAccessorDescriptor(current) and IsAccessorDescriptor(Desc) are both true,
      // a. If the [[Configurable]] field of current is false, then
      if (!current.configurable) {
        // i. Return false, if the [[Set]] field of Desc is present and SameValue(Desc.[[Set]], current.[[Set]]) is false.
        if (Desc.set && !SameValuePartial(realm, Desc.set, current.set || realm.intrinsics.undefined)) return false;

        // ii. Return false, if the [[Get]] field of Desc is present and SameValue(Desc.[[Get]], current.[[Get]]) is false.
        if (Desc.get && !SameValuePartial(realm, Desc.get, current.get || realm.intrinsics.undefined)) return false;
      }
    }

    // 10. If O is not undefined, then
    if (O !== undefined) {
      invariant(P !== undefined);
      let key = InternalGetPropertiesKey(P);
      let map = InternalGetPropertiesMap(O, P);
      let propertyBinding = map.get(key);
      if (propertyBinding === undefined) {
        propertyBinding = { descriptor: undefined, object: O, key: key };
        realm.recordModifiedProperty(propertyBinding);
        propertyBinding.descriptor = current;
        map.set(key, propertyBinding);
      } else if (propertyBinding.descriptor === undefined) {
        realm.recordModifiedProperty(propertyBinding);
        propertyBinding.descriptor = current;
      } else {
        realm.recordModifiedProperty(propertyBinding);
        propertyBinding.descriptor = current;
      }

      // a. For each field of Desc that is present, set the corresponding attribute of the property named P of
      //    object O to the value of the field.
      for (let field in Desc) current[field] = Desc[field];
      InternalUpdatedProperty(realm, O, P, oldDesc);
    }

    // 11. Return true.
    return true;
  }

  // ECMA262 9.1.6.1
  OrdinaryDefineOwnProperty(realm: Realm, O: ObjectValue, P: PropertyKeyValue, Desc: Descriptor): boolean {
    invariant(O instanceof ObjectValue);

    // 1. Let current be ? O.[[GetOwnProperty]](P).
    let current;
    let binding = InternalGetPropertiesMap(O, P).get(InternalGetPropertiesKey(P));
    if (binding !== undefined || !(O.isPartialObject() && O.isSimpleObject())) current = O.$GetOwnProperty(P);

    // 2. Let extensible be the value of the [[Extensible]] internal slot of O.
    let extensible = O.getExtensible();

    // 3. Return ValidateAndApplyPropertyDescriptor(O, P, extensible, Desc, current).
    return this.ValidateAndApplyPropertyDescriptor(realm, O, P, extensible, Desc, current);
  }

  // ECMA262 19.1.2.3.1
  ObjectDefineProperties(realm: Realm, O: Value, Properties: Value): ObjectValue | AbstractObjectValue {
    // 1. If Type(O) is not Object, throw a TypeError exception.
    if (O.mightNotBeObject()) {
      if (O.mightBeObject()) O.throwIfNotConcrete();
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }
    invariant(O instanceof ObjectValue || O instanceof AbstractObjectValue);

    // 2. Let props be ? ToObject(Properties).
    let props = To.ToObject(realm, Properties.throwIfNotConcrete());

    // 3. Let keys be ? props.[[OwnPropertyKeys]]().
    let keys = props.$OwnPropertyKeys();

    // 4. Let descriptors be a new empty List.
    let descriptors = [];

    // 5. Repeat for each element nextKey of keys in List order,
    for (let nextKey of keys) {
      // a. Let propDesc be ? props.[[GetOwnProperty]](nextKey).
      let propDesc = props.$GetOwnProperty(nextKey);

      // b. If propDesc is not undefined and propDesc.[[Enumerable]] is true, then
      if (propDesc && propDesc.enumerable) {
        this.ThrowIfMightHaveBeenDeleted(propDesc.value);

        // i. Let descObj be ? Get(props, nextKey).
        let descObj = Get(realm, props, nextKey);

        // ii. Let desc be ? ToPropertyDescriptor(descObj).
        let desc = To.ToPropertyDescriptor(realm, descObj);

        // iii. Append the pair (a two element List) consisting of nextKey and desc to the end of descriptors.
        descriptors.push([nextKey, desc]);
      }
    }

    // 6. For each pair from descriptors in list order,
    for (let pair of descriptors) {
      // a. Let P be the first element of pair.
      let P = pair[0];

      // b. Let desc be the second element of pair.
      let desc = pair[1];

      // c. Perform ? DefinePropertyOrThrow(O, P, desc).
      this.DefinePropertyOrThrow(realm, O, P, desc);
    }

    // 7. Return O.
    return O;
  }

  // ECMA262 7.3.3
  Set(realm: Realm, O: ObjectValue | AbstractObjectValue, P: PropertyKeyValue, V: Value, Throw: boolean): boolean {
    // 1. Assert: Type(O) is Object.

    // 2. Assert: IsPropertyKey(P) is true.
    invariant(IsPropertyKey(realm, P), "expected property key");

    // 3. Assert: Type(Throw) is Boolean.
    invariant(typeof Throw === "boolean", "expected boolean");

    // 4. Let success be ? O.[[Set]](P, V, O).
    let success = O.$Set(P, V, O);

    // 5. If success is false and Throw is true, throw a TypeError exception.
    if (success === false && Throw === true) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 6. Return success.
    return success;
  }

  // ECMA262 7.3.7
  DefinePropertyOrThrow(
    realm: Realm,
    O: ObjectValue | AbstractObjectValue,
    P: PropertyKeyValue,
    desc: Descriptor
  ): boolean {
    // 1. Assert: Type(O) is Object.

    // 2. Assert: IsPropertyKey(P) is true.
    invariant(typeof P === "string" || IsPropertyKey(realm, P), "expected property key");

    // 3. Let success be ? O.[[DefineOwnProperty]](P, desc).
    let success = O.$DefineOwnProperty(P, desc);

    // 4. If success is false, throw a TypeError exception.
    if (success === false) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
    }

    // 5. Return success.
    return success;
  }

  // ECMA262 6.2.3.2
  PutValue(realm: Realm, V: Value | Reference, W: Value): void | boolean | Value {
    W = W.promoteEmptyToUndefined();
    // The following two steps are not necessary as we propagate completions with exceptions.
    // 1. ReturnIfAbrupt(V).
    // 2. ReturnIfAbrupt(W).

    // 3. If Type(V) is not Reference, throw a ReferenceError exception.
    if (!(V instanceof Reference)) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.ReferenceError, "can't put a value to a non-reference");
    }

    // 4. Let base be GetBase(V).
    let base = Environment.GetBase(realm, V);

    // 5. If IsUnresolvableReference(V) is true, then
    if (Environment.IsUnresolvableReference(realm, V)) {
      // a. If IsStrictReference(V) is true, then
      if (Environment.IsStrictReference(realm, V)) {
        // i. Throw a ReferenceError exception.
        throw realm.createErrorThrowCompletion(realm.intrinsics.ReferenceError);
      }

      // b. Let globalObj be GetGlobalObject().
      let globalObj = GetGlobalObject(realm);

      // c. Return ? Set(globalObj, GetReferencedName(V), W, false).
      return this.Set(realm, globalObj, Environment.GetReferencedName(realm, V), W, false);
    }

    // 6. Else if IsPropertyReference(V) is true, then
    if (Environment.IsPropertyReference(realm, V)) {
      // a. If HasPrimitiveBase(V) is true, then
      if (Environment.HasPrimitiveBase(realm, V)) {
        // i. Assert: In realm case, base will never be null or undefined.
        invariant(base instanceof Value && !HasSomeCompatibleType(base, UndefinedValue, NullValue));

        // ii. Set base to ToObject(base).
        base = To.ToObjectPartial(realm, base);
      }
      invariant(base instanceof ObjectValue || base instanceof AbstractObjectValue);

      // b. Let succeeded be ? base.[[Set]](GetReferencedName(V), W, GetThisValue(V)).
      let succeeded = base.$SetPartial(Environment.GetReferencedNamePartial(realm, V), W, GetThisValue(realm, V));

      // c. If succeeded is false and IsStrictReference(V) is true, throw a TypeError exception.
      if (succeeded === false && Environment.IsStrictReference(realm, V)) {
        throw realm.createErrorThrowCompletion(realm.intrinsics.TypeError);
      }

      // d. Return.
      return;
    }

    // 7. Else base must be an Environment Record,
    if (base instanceof EnvironmentRecord) {
      // a. Return ? base.SetMutableBinding(GetReferencedName(V), W, IsStrictReference(V)) (see 8.1.1).
      let referencedName = Environment.GetReferencedName(realm, V);
      invariant(typeof referencedName === "string");
      return base.SetMutableBinding(referencedName, W, Environment.IsStrictReference(realm, V));
    }

    invariant(false);
  }

  // ECMA262 9.4.2.4
  ArraySetLength(realm: Realm, A: ArrayValue, Desc: Descriptor): boolean {
    // 1. If the [[Value]] field of Desc is absent, then
    let DescValue = Desc.value;
    if (!DescValue) {
      // a. Return OrdinaryDefineOwnProperty(A, "length", Desc).
      return this.OrdinaryDefineOwnProperty(realm, A, "length", Desc);
    }
    invariant(DescValue instanceof Value);

    // 2. Let newLenDesc be a copy of Desc.
    let newLenDesc = Object.assign({}, Desc);

    // 3. Let newLen be ? ToUint32(Desc.[[Value]]).
    let newLen = To.ToUint32(realm, DescValue);

    // 4. Let numberLen be ? ToNumber(Desc.[[Value]]).
    let numberLen = To.ToNumber(realm, DescValue);

    // 5. If newLen ≠ numberLen, throw a RangeError exception.
    if (newLen !== numberLen) {
      throw realm.createErrorThrowCompletion(realm.intrinsics.RangeError, "should be a uint");
    }

    // 6. Set newLenDesc.[[Value]] to newLen.
    newLenDesc.value = new NumberValue(realm, newLen);

    // 7. Let oldLenDesc be OrdinaryGetOwnProperty(A, "length").
    let oldLenDesc = this.OrdinaryGetOwnProperty(realm, A, "length");

    // 8. Assert: oldLenDesc will never be undefined or an accessor descriptor because Array objects are created
    //    with a length data property that cannot be deleted or reconfigured.
    invariant(
      oldLenDesc !== undefined && !IsAccessorDescriptor(realm, oldLenDesc),
      "cannot be undefined or an accessor descriptor"
    );

    // 9. Let oldLen be oldLenDesc.[[Value]].
    let oldLen = oldLenDesc.value;
    invariant(oldLen instanceof Value);
    oldLen = oldLen.throwIfNotConcrete();
    invariant(oldLen instanceof NumberValue, "should be a number");
    oldLen = (oldLen.value: number);

    // 10. If newLen ≥ oldLen, then
    if (newLen >= oldLen) {
      // a. Return OrdinaryDefineOwnProperty(A, "length", newLenDesc).
      return this.OrdinaryDefineOwnProperty(realm, A, "length", newLenDesc);
    }

    // 11. If oldLenDesc.[[Writable]] is false, return false.
    if (!oldLenDesc.writable) return false;

    // 12. If newLenDesc.[[Writable]] is absent or has the value true, let newWritable be true.
    let newWritable;
    if (!("writable" in newLenDesc) || newLenDesc.writable === true) {
      newWritable = true;
    } else {
      // 13. Else,
      // a. Need to defer setting the [[Writable]] attribute to false in case any elements cannot be deleted.

      // b. Let newWritable be false.
      newWritable = false;

      // c. Set newLenDesc.[[Writable]] to true.
      newLenDesc.writable = true;
    }

    // 14. Let succeeded be ! OrdinaryDefineOwnProperty(A, "length", newLenDesc).
    let succeeded = this.OrdinaryDefineOwnProperty(realm, A, "length", newLenDesc);

    // 15. If succeeded is false, return false.
    if (succeeded === false) return false;

    // Here we diverge from the spec: instead of traversing all indices from
    // oldLen to newLen, only the indices that are actually present are touched.
    let oldLenCopy = oldLen;
    let keys = Array.from(A.properties.keys())
      .map(x => parseInt(x, 10))
      .filter(x => newLen <= x && x <= oldLenCopy)
      .sort()
      .reverse();

    // 16. While newLen < oldLen repeat,
    for (let key of keys) {
      // a. Set oldLen to oldLen - 1.
      oldLen = key;

      // b. Let deleteSucceeded be ! A.[[Delete]](! ToString(oldLen)).
      let deleteSucceeded = A.$Delete(oldLen + "");

      // c. If deleteSucceeded is false, then
      if (deleteSucceeded === false) {
        // i. Set newLenDesc.[[Value]] to oldLen + 1.
        newLenDesc.value = new NumberValue(realm, oldLen + 1);

        // ii. If newWritable is false, set newLenDesc.[[Writable]] to false.
        if (newWritable === false) newLenDesc.writable = false;

        // iii. Let succeeded be ! OrdinaryDefineOwnProperty(A, "length", newLenDesc).
        succeeded = this.OrdinaryDefineOwnProperty(realm, A, "length", newLenDesc);

        // iv. Return false.
        return false;
      }
    }

    // 17. If newWritable is false, then
    if (!newWritable) {
      // a. Return OrdinaryDefineOwnProperty(A, "length", PropertyDescriptor{[[Writable]]: false}). This call will always return true.
      return this.OrdinaryDefineOwnProperty(realm, A, "length", {
        writable: false,
      });
    }

    // 18. Return true.
    return true;
  }

  // ECMA262 9.1.5.1
  OrdinaryGetOwnProperty(realm: Realm, O: ObjectValue, P: PropertyKeyValue): Descriptor | void {
    if (!realm.ignoreLeakLogic && O.isLeakedObject()) {
      invariant(realm.generator);
      let pname = realm.generator.getAsPropertyNameExpression(StringKey(P));
      let absVal = AbstractValue.createTemporalFromBuildFunction(realm, Value, [O], ([node]) =>
        t.memberExpression(node, pname, !t.isIdentifier(pname))
      );
      // TODO: We can't be sure what the descriptor will be, but the value will be abstract.
      return { configurable: true, enumerable: true, value: absVal, writable: true };
    }

    // 1. Assert: IsPropertyKey(P) is true.
    invariant(IsPropertyKey(realm, P), "expected a property key");

    // 2. If O does not have an own property with key P, return undefined.
    let existingBinding = InternalGetPropertiesMap(O, P).get(InternalGetPropertiesKey(P));
    if (!existingBinding) {
      if (O.isPartialObject()) {
        invariant(realm.useAbstractInterpretation); // __makePartial will already have thrown an error if not
        if (O.isSimpleObject()) {
          if (P instanceof StringValue) P = P.value;
          if (typeof P === "string") {
            // In this case it is safe to defer the property access to runtime (at this point in time)
            invariant(realm.generator);
            let pname = realm.generator.getAsPropertyNameExpression(P);
            let absVal = AbstractValue.createTemporalFromBuildFunction(realm, Value, [O], ([node]) =>
              t.memberExpression(node, pname, !t.isIdentifier(pname))
            );
            return { configurable: true, enumerable: true, value: absVal, writable: true };
          } else {
            invariant(P instanceof SymbolValue);
            // Simple objects don't have symbol properties
            return undefined;
          }
        }
        AbstractValue.reportIntrospectionError(O, P);
        throw new FatalError();
      }
      return undefined;
    }
    realm.callReportPropertyAccess(existingBinding);
    if (!existingBinding.descriptor) return undefined;

    // 3. Let D be a newly created Property Descriptor with no fields.
    let D = {};

    // 4. Let X be O's own property whose key is P.
    let X = existingBinding.descriptor;
    invariant(X !== undefined);

    if (X.joinCondition !== undefined) {
      D.joinCondition = X.joinCondition;
      D.descriptor1 = X.descriptor1;
      D.descriptor2 = X.descriptor2;
      return D;
    }
    // 5. If X is a data property, then
    if (IsDataDescriptor(realm, X)) {
      let value = X.value;
      if (O.isPartialObject() && value instanceof AbstractValue && value.kind !== "resolved") {
        let savedUnion;
        let savedIndex;
        if (value.kind === "abstractConcreteUnion") {
          savedUnion = value;
          savedIndex = savedUnion.args.findIndex(e => e instanceof AbstractValue);
          invariant(savedIndex >= 0);
          value = savedUnion.args[savedIndex];
          invariant(value instanceof AbstractValue);
        }
        let realmGenerator = realm.generator;
        invariant(realmGenerator);
        value = realmGenerator.derive(value.types, value.values, value.args, value.getBuildNode(), {
          kind: "resolved",
          // We can't emit the invariant here otherwise it'll assume the AbstractValue's type not the union type
          skipInvariant: true,
        });
        if (savedUnion !== undefined) {
          invariant(savedIndex !== undefined);
          let args = savedUnion.args.slice(0);
          args[savedIndex] = value;
          value = AbstractValue.createAbstractConcreteUnion(realm, ...args);
        }
        if (typeof P === "string") realmGenerator.emitFullInvariant(O, P, value);
        InternalSetProperty(realm, O, P, {
          value: value,
          writable: "writable" in X ? X.writable : false,
          enumerable: "enumerable" in X ? X.enumerable : false,
          configurable: "configurable" in X ? X.configurable : false,
        });
      }

      // a. Set D.[[Value]] to the value of X's [[Value]] attribute.
      D.value = value;

      // b. Set D.[[Writable]] to the value of X's [[Writable]] attribute.
      D.writable = X.writable;
    } else {
      // 6. Else X is an accessor property,
      invariant(IsAccessorDescriptor(realm, X), "expected accessor property");

      // a. Set D.[[Get]] to the value of X's [[Get]] attribute.
      D.get = X.get;

      // b. Set D.[[Set]] to the value of X's [[Set]] attribute.
      D.set = X.set;
    }

    // 7. Set D.[[Enumerable]] to the value of X's [[Enumerable]] attribute.
    D.enumerable = X.enumerable;

    // 8. Set D.[[Configurable]] to the value of X's [[Configurable]] attribute.
    D.configurable = X.configurable;

    // 9. Return D.
    return D;
  }

  // ECMA262 9.1.2.1
  OrdinarySetPrototypeOf(realm: Realm, O: ObjectValue, V: ObjectValue | NullValue): boolean {
    ensureIsNotFinal(realm, O);
    if (!realm.ignoreLeakLogic && O.isLeakedObject()) {
      throw new FatalError();
    }

    // 1. Assert: Either Type(V) is Object or Type(V) is Null.
    invariant(V instanceof ObjectValue || V instanceof NullValue);

    // 2. Let extensible be the value of the [[Extensible]] internal slot of O.
    let extensible = O.getExtensible();

    // 3. Let current be the value of the [[Prototype]] internal slot of O.
    let current = O.$Prototype;

    // 4. If SameValue(V, current) is true, return true.
    if (SameValue(realm, V, current)) return true;

    // 5. If extensible is false, return false.
    if (!extensible) return false;

    // 6. Let p be V.
    let p = V;

    // 7. Let done be false.
    let done = false;

    // 8. Repeat while done is false,
    while (!done) {
      // a. If p is null, let done be true.
      if (p instanceof NullValue) {
        done = true;
      } else if (SameValue(realm, p, O)) {
        // b. Else if SameValue(p, O) is true, return false.
        return false;
      } else {
        // c. Else,
        // TODO #1017 i. If the [[GetPrototypeOf]] internal method of p is not the ordinary object internal method defined in 9.1.1, let done be true.

        // ii. Else, let p be the value of p's [[Prototype]] internal slot.
        p = p.$Prototype;
      }
    }

    // 9. Set the value of the [[Prototype]] internal slot of O to V.
    O.$Prototype = V;

    // 10. Return true.
    return true;
  }

  // ECMA262 13.7.5.15
  EnumerateObjectProperties(realm: Realm, O: ObjectValue): ObjectValue {
    /*global global*/
    let visited = new global.Set();
    let obj = O;
    let keys = O.$OwnPropertyKeys();
    let index = 0;

    let iterator = new ObjectValue(realm);
    iterator.defineNativeMethod("next", 0, () => {
      while (true) {
        if (index >= keys.length) {
          let proto = obj.$GetPrototypeOf();
          if (proto instanceof NullValue) {
            return Create.CreateIterResultObject(realm, realm.intrinsics.undefined, true);
          }
          obj = proto;
          keys = obj.$OwnPropertyKeys();
          index = 0;
        }

        let key = keys[index];

        // Omit symbols.
        if (!(key instanceof StringValue)) {
          index += 1;
          continue;
        }

        // Omit non-enumerable properties.
        let desc = obj.$GetOwnProperty(key);
        if (desc && !desc.enumerable) {
          this.ThrowIfMightHaveBeenDeleted(desc.value);
          index += 1;
          visited.add(key.value);
          continue;
        }

        // Omit duplicates.
        if (visited.has(key.value)) {
          index += 1;
          continue;
        }
        visited.add(key.value);

        // Yield the key.
        return Create.CreateIterResultObject(realm, key, false);
      }
    });
    return iterator;
  }

  ThrowIfMightHaveBeenDeleted(
    value: void | Value | Array<Value> | Array<{ $Key: void | Value, $Value: void | Value }>
  ): void {
    if (!(value instanceof Value)) return;
    if (!value.mightHaveBeenDeleted()) return;
    invariant(value instanceof AbstractValue); // real empty values should never get here
    AbstractValue.reportIntrospectionError(value);
    throw new FatalError();
  }

  ThrowIfInternalSlotNotWritable<T: ObjectValue>(realm: Realm, object: T, key: string): T {
    if (!realm.isNewObject(object)) {
      AbstractValue.reportIntrospectionError(object, key);
      throw new FatalError();
    }
    return object;
  }

  // ECMA 14.3.9
  PropertyDefinitionEvaluation(
    realm: Realm,
    MethodDefinition: BabelNodeObjectMethod | BabelNodeClassMethod,
    object: ObjectValue,
    env: LexicalEnvironment,
    strictCode: boolean,
    enumerable: boolean
  ): boolean {
    // MethodDefinition : PropertyName ( StrictFormalParameters ) { FunctionBody }
    if (MethodDefinition.kind === "method") {
      // 1. Let methodDef be DefineMethod of MethodDefinition with argument object.
      let methodDef = Functions.DefineMethod(realm, MethodDefinition, object, env, strictCode);

      // 2. ReturnIfAbrupt(methodDef).

      // 3. Perform SetFunctionName(methodDef.[[closure]], methodDef.[[key]]).
      Functions.SetFunctionName(realm, methodDef.$Closure, methodDef.$Key);

      // If the AST name was computed, give the hint to the closure
      methodDef.$Closure.$HasComputedName = !!MethodDefinition.computed;

      // 4. Let desc be the Property Descriptor{[[Value]]: methodDef.[[closure]], [[Writable]]: true, [[Enumerable]]: enumerable, [[Configurable]]: true}.
      let desc: Descriptor = { value: methodDef.$Closure, writable: true, enumerable: enumerable, configurable: true };

      // 5. Return DefinePropertyOrThrow(object, methodDef.[[key]], desc).
      return this.DefinePropertyOrThrow(realm, object, methodDef.$Key, desc);
    } else if (MethodDefinition.kind === "generator") {
      // MethodDefinition : GeneratorMethod
      // See 14.4.
      // ECMA 14.4.13
      // 1. Let propKey be the result of evaluating PropertyName.
      let propKey = EvalPropertyName(MethodDefinition, env, realm, strictCode);

      // 2. ReturnIfAbrupt(propKey).
      // 3. If the function code for this GeneratorMethod is strict mode code, let strict be true. Otherwise let strict be false.
      let strict = strictCode || IsStrict(MethodDefinition.body);

      // 4. Let scope be the running execution context’s LexicalEnvironment.
      let scope = env;

      // 5. Let closure be GeneratorFunctionCreate(Method, StrictFormalParameters, GeneratorBody, scope, strict).
      let closure = Functions.GeneratorFunctionCreate(
        realm,
        "method",
        MethodDefinition.params,
        MethodDefinition.body,
        scope,
        strict
      );

      // 6. Perform MakeMethod(closure, object).
      Functions.MakeMethod(realm, closure, object);

      // 7. Let prototype be ObjectCreate(%GeneratorPrototype%).
      let prototype = Create.ObjectCreate(realm, realm.intrinsics.GeneratorPrototype);
      prototype.originalConstructor = closure;

      // 8. Perform MakeConstructor(closure, true, prototype).
      MakeConstructor(realm, closure, true, prototype);

      // 9. Perform SetFunctionName(closure, propKey).
      Functions.SetFunctionName(realm, closure, propKey);

      // 10. Let desc be the Property Descriptor{[[Value]]: closure, [[Writable]]: true, [[Enumerable]]: enumerable, [[Configurable]]: true}.
      let desc: Descriptor = { value: closure, writable: true, enumerable: enumerable, configurable: true };

      // 11. Return DefinePropertyOrThrow(object, propKey, desc).
      return this.DefinePropertyOrThrow(realm, object, propKey, desc);
    } else if (MethodDefinition.kind === "get") {
      // 1. Let propKey be the result of evaluating PropertyName.
      let propKey = EvalPropertyName(MethodDefinition, env, realm, strictCode);

      // 2. ReturnIfAbrupt(propKey).

      // 3. If the function code for this MethodDefinition is strict mode code, let strict be true. Otherwise let strict be false.
      let strict = strictCode || IsStrict(MethodDefinition.body);

      // 4. Let scope be the running execution context's LexicalEnvironment.
      let scope = env;

      // 5. Let formalParameterList be the production FormalParameters:[empty] .
      let formalParameterList = [];

      // 6. Let closure be FunctionCreate(Method, formalParameterList, FunctionBody, scope, strict).
      let closure = Functions.FunctionCreate(
        realm,
        "method",
        formalParameterList,
        MethodDefinition.body,
        scope,
        strict
      );

      // 7. Perform MakeMethod(closure, object).
      Functions.MakeMethod(realm, closure, object);

      // 8. Perform SetFunctionName(closure, propKey, "get").
      Functions.SetFunctionName(realm, closure, propKey, "get");

      // If the AST name was computed, give the hint to the closure
      closure.$HasComputedName = !!MethodDefinition.computed;

      // 9. Let desc be the PropertyDescriptor{[[Get]]: closure, [[Enumerable]]: enumerable, [[Configurable]]: true}.
      let desc = {
        get: closure,
        enumerable: true,
        configurable: true,
      };

      // 10. Return ? DefinePropertyOrThrow(object, propKey, desc).
      return this.DefinePropertyOrThrow(realm, object, propKey, desc);
    } else {
      invariant(MethodDefinition.kind === "set");
      // 1. Let propKey be the result of evaluating PropertyName.
      let propKey = EvalPropertyName(MethodDefinition, env, realm, strictCode);

      // 2. ReturnIfAbrupt(propKey).

      // 3. If the function code for this MethodDefinition is strict mode code, let strict be true. Otherwise let strict be false.
      let strict = strictCode || IsStrict(MethodDefinition.body);

      // 4. Let scope be the running execution context's LexicalEnvironment.
      let scope = env;

      // 5. Let closure be FunctionCreate(Method, PropertySetParameterList, FunctionBody, scope, strict).
      let closure = Functions.FunctionCreate(
        realm,
        "method",
        MethodDefinition.params,
        MethodDefinition.body,
        scope,
        strict
      );

      // 6. Perform MakeMethod(closure, object).
      Functions.MakeMethod(realm, closure, object);

      // 7. Perform SetFunctionName(closure, propKey, "set").
      Functions.SetFunctionName(realm, closure, propKey, "set");

      // If the AST name was computed, give the hint to the closure
      closure.$HasComputedName = !!MethodDefinition.computed;

      // 8. Let desc be the PropertyDescriptor{[[Set]]: closure, [[Enumerable]]: enumerable, [[Configurable]]: true}.
      let desc = {
        set: closure,
        enumerable: true,
        configurable: true,
      };

      // 9. Return ? DefinePropertyOrThrow(object, propKey, desc).
      return this.DefinePropertyOrThrow(realm, object, propKey, desc);
    }
  }
}
