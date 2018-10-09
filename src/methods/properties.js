/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { construct_empty_effects, type Realm, Effects } from "../realm.js";
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
  PrimitiveValue,
  Value,
} from "../values/index.js";
import { EvalPropertyName } from "../evaluators/ObjectExpression.js";
import { EnvironmentRecord, Reference } from "../environment.js";
import { CompilerDiagnostic, FatalError } from "../errors.js";
import invariant from "../invariant.js";
import {
  Call,
  Get,
  GetGlobalObject,
  GetThisValue,
  HasCompatibleType,
  HasSomeCompatibleType,
  IsAccessorDescriptor,
  IsDataDescriptor,
  IsGenericDescriptor,
  IsPropertyKey,
  MakeConstructor,
  SameValue,
  SameValuePartial,
} from "./index.js";
import { type BabelNodeObjectMethod, type BabelNodeClassMethod, isValidIdentifier } from "@babel/types";
import type { LexicalEnvironment } from "../environment.js";
import { Create, Environment, Functions, Leak, Join, Path, To } from "../singletons.js";
import IsStrict from "../utils/strict.js";
import { createOperationDescriptor } from "../utils/generator.js";
import { TypesDomain, ValuesDomain } from "../domains/index.js";
import { cloneDescriptor, equalDescriptors, PropertyDescriptor, AbstractJoinedDescriptor } from "../descriptors.js";

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
  if (!O.isIntrinsic() && O.temporalAlias === undefined) return;
  if (P instanceof SymbolValue) return;
  if (P instanceof StringValue) P = P.value;
  invariant(!O.mightBeLeakedObject()); // leaked objects are never updated
  invariant(!O.mightBeFinalObject()); // final objects are never updated
  invariant(typeof P === "string");
  let propertyBinding = InternalGetPropertiesMap(O, P).get(P);
  invariant(propertyBinding !== undefined); // The callers ensure this
  let desc = propertyBinding.descriptor;
  if (desc === undefined) {
    // The property is being deleted
    if (O === realm.$GlobalObject) {
      generator.emitGlobalDelete(P);
    } else {
      generator.emitPropertyDelete(O, P);
    }
  } else {
    desc = desc.throwIfNotConcrete(realm);
    if (oldDesc === undefined) {
      // The property is being created
      if (O === realm.$GlobalObject) {
        if (IsDataDescriptor(realm, desc)) {
          let descValue = desc.value || realm.intrinsics.undefined;
          if (isValidIdentifier(P) && !desc.configurable && desc.enumerable && desc.writable) {
            generator.emitGlobalDeclaration(P, descValue);
          } else if (desc.configurable && desc.enumerable && desc.writable) {
            generator.emitGlobalAssignment(P, descValue);
          } else {
            generator.emitDefineProperty(O, P, desc);
          }
        } else {
          generator.emitDefineProperty(O, P, desc);
        }
      } else {
        if (IsDataDescriptor(realm, desc) && desc.configurable && desc.enumerable && desc.writable) {
          let descValue = desc.value || realm.intrinsics.undefined;
          generator.emitPropertyAssignment(O, P, descValue);
        } else {
          generator.emitDefineProperty(O, P, desc);
        }
      }
    } else {
      invariant(oldDesc instanceof PropertyDescriptor);
      // The property is being modified
      if (equalDescriptors(desc, oldDesc)) {
        invariant(IsDataDescriptor(realm, desc));
        let descValue = desc.value || realm.intrinsics.undefined;
        // only the value is being modified
        if (O === realm.$GlobalObject) {
          generator.emitGlobalAssignment(P, descValue);
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
  if (desc instanceof AbstractJoinedDescriptor) {
    if (desc.descriptor1) {
      leakDescriptor(realm, desc.descriptor1);
    }
    if (desc.descriptor2) {
      leakDescriptor(realm, desc.descriptor2);
    }
  }
  invariant(desc instanceof PropertyDescriptor);

  if (desc.value) {
    if (desc.value instanceof Value) Leak.value(realm, desc.value);
    else if (desc.value !== undefined) {
      for (let val of desc.value) Leak.value(realm, val);
    }
  }
  if (desc.get) {
    Leak.value(realm, desc.get);
  }
  if (desc.set) {
    Leak.value(realm, desc.set);
  }
}

// Determines if an object with parent O may create its own property P.
function parentPermitsChildPropertyCreation(realm: Realm, O: ObjectValue, P: PropertyKeyValue): boolean {
  if (O.isSimpleObject()) {
    // Simple object always allow property creation since there are no setters.
    // Object.prototype is considered simple even though __proto__ is a setter.
    // TODO: That is probably the incorrect assumption but that is implied everywhere.
    return true;
  }

  let ownDesc = O.$GetOwnProperty(P);
  if (!ownDesc || ownDesc.mightHaveBeenDeleted()) {
    // O might not object, so first ask its parent
    let parent = O.$GetPrototypeOf();
    if (!(parent instanceof NullValue)) {
      parent = parent.throwIfNotConcreteObject(); //TODO #1016: deal with abstract parents
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
  if (O.mightNotBeFinalObject()) {
    return;
  }

  // We can't continue because this object is already in its final state
  if (realm.instantRender.enabled) {
    realm.instantRenderBailout(
      "Object mutations that require materialization are currently not supported by InstantRender",
      realm.currentLocation
    );
  } else {
    let error = new CompilerDiagnostic(
      "Mutating a final object, or an object with unknown properties, after some of those " +
        "properties have already been used, is not supported.",
      realm.currentLocation,
      "PP0026",
      "FatalError"
    );
    realm.handleError(error);
    throw new FatalError();
  }
}

function isWidenedValue(v: void | Value) {
  if (!(v instanceof AbstractValue)) return false;
  if (v.kind === "widened" || v.kind === "widened property") return true;
  for (let a of v.args) {
    if (isWidenedValue(a)) return true;
  }
  return false;
}

export class PropertiesImplementation {
  // ECMA262 9.1.9.1
  OrdinarySet(realm: Realm, O: ObjectValue, P: PropertyKeyValue, V: Value, Receiver: Value): boolean {
    ensureIsNotFinal(realm, O, P);
    if (!realm.ignoreLeakLogic && O.mightBeLeakedObject()) {
      // Leaking is transitive, hence writing a value to a leaked object leaks the value
      Leak.value(realm, V);
      // The receiver might leak to a getter so if it's not already leaked, we need to leak it.
      Leak.value(realm, Receiver);
      if (realm.generator !== undefined) {
        realm.generator.emitPropertyAssignment(Receiver, StringKey(P), V);
      }
      return true;
    }

    let weakDeletion = V.mightHaveBeenDeleted();

    // 1. Assert: IsPropertyKey(P) is true.
    invariant(IsPropertyKey(realm, P), "expected property key");

    // 2. Let ownDesc be ? O.[[GetOwnProperty]](P).
    let ownDesc = O.$GetOwnProperty(P);

    // 3. If ownDesc is undefined (or might be), then
    if (!ownDesc || ownDesc.mightHaveBeenDeleted()) {
      // a. Let parent be ? O.[[GetPrototypeOf]]().
      let parent = O.$GetPrototypeOf();

      // b. If parent is not null, then
      if (!(parent instanceof NullValue)) {
        parent = parent.throwIfNotConcreteObject(); //TODO #1016: deal with abstract parents
        if (!ownDesc) {
          // i. Return ? parent.[[Set]](P, V, Receiver).
          return parent.$Set(P, V, Receiver);
        }
        // But since we don't know if O has its own property P, the parent might
        // actually have a say. Give up, unless the parent would be OK with it.
        if (!parentPermitsChildPropertyCreation(realm, parent, P)) {
          // TODO: Join the effects depending on if the property was deleted or not.
          let error = new CompilerDiagnostic(
            "assignment might or might not invoke a setter",
            realm.currentLocation,
            "PP0043",
            "RecoverableError"
          );
          if (realm.handleError(error) !== "Recover") {
            throw new FatalError();
          }
          // If we recover, we assume that the parent would've been fine creating the property.
        }
        // Since the parent is OK with us creating a local property for O
        // we can carry on as if there were no parent.
      }

      // i. Let ownDesc be the PropertyDescriptor{[[Value]]: undefined, [[Writable]]: true, [[Enumerable]]: true, [[Configurable]]: true}.
      if (!ownDesc)
        ownDesc = new PropertyDescriptor({
          value: realm.intrinsics.undefined,
          writable: true,
          enumerable: true,
          configurable: true,
        });
    }

    // joined descriptors need special treatment
    if (ownDesc instanceof AbstractJoinedDescriptor) {
      let joinCondition = ownDesc.joinCondition;
      let descriptor2 = ownDesc.descriptor2;
      ownDesc = ownDesc.descriptor1;
      let e1 = Path.withCondition(joinCondition, () => {
        return ownDesc !== undefined
          ? realm.evaluateForEffects(() => new BooleanValue(realm, OrdinarySetHelper()), undefined, "OrdinarySet/1")
          : construct_empty_effects(realm);
      });
      let {
        result: result1,
        generator: generator1,
        modifiedBindings: modifiedBindings1,
        modifiedProperties: modifiedProperties1,
        createdObjects: createdObjects1,
        createdAbstracts: createdAbstracts1,
      } = e1;
      ownDesc = descriptor2;
      let e2 = Path.withInverseCondition(joinCondition, () => {
        return ownDesc !== undefined
          ? realm.evaluateForEffects(() => new BooleanValue(realm, OrdinarySetHelper()), undefined, "OrdinarySet/2")
          : construct_empty_effects(realm);
      });
      let {
        result: result2,
        generator: generator2,
        modifiedBindings: modifiedBindings2,
        modifiedProperties: modifiedProperties2,
        createdObjects: createdObjects2,
        createdAbstracts: createdAbstracts2,
      } = e2;

      // Join the effects, creating an abstract view of what happened, regardless
      // of the actual value of ownDesc.joinCondition.
      let joinedEffects = Join.joinEffects(
        joinCondition,
        new Effects(result1, generator1, modifiedBindings1, modifiedProperties1, createdObjects1, createdAbstracts1),
        new Effects(result2, generator2, modifiedBindings2, modifiedProperties2, createdObjects2, createdAbstracts2)
      );
      realm.applyEffects(joinedEffects);
      return To.ToBooleanPartial(realm, realm.returnOrThrowCompletion(joinedEffects.result));
    }

    return OrdinarySetHelper();

    function OrdinarySetHelper(): boolean {
      invariant(ownDesc !== undefined);
      // 4. If IsDataDescriptor(ownDesc) is true, then
      if (IsDataDescriptor(realm, ownDesc)) {
        // a. If ownDesc.[[Writable]] is false, return false.
        if (!ownDesc.writable && !weakDeletion) {
          // The write will fail if the property actually exists
          if (ownDesc.value && ownDesc.value.mightHaveBeenDeleted()) {
            // But maybe it does not and thus would succeed.
            // Since we don't know what will happen, give up for now.
            // TODO: Join the effects depending on if the property was deleted or not.
            let error = new CompilerDiagnostic(
              "assignment might or might not invoke a setter",
              realm.currentLocation,
              "PP0043",
              "RecoverableError"
            );
            if (realm.handleError(error) !== "Recover") {
              throw new FatalError();
            }
            // If we recover we assume that the property was there.
          }
          return false;
        }

        // b. If Type(Receiver) is not Object, return false.
        if (!Receiver.mightBeObject()) return false;
        invariant(Receiver instanceof ObjectValue || Receiver instanceof AbstractObjectValue);

        // c. Let existingDescriptor be ? Receiver.[[GetOwnProperty]](P).
        let existingDescriptor = Receiver.$GetOwnProperty(P);
        if (existingDescriptor instanceof AbstractJoinedDescriptor) {
          if (existingDescriptor.descriptor1 === ownDesc) existingDescriptor = ownDesc;
          else if (existingDescriptor.descriptor2 === ownDesc) existingDescriptor = ownDesc;
        }
        let existingDescValue = !existingDescriptor
          ? realm.intrinsics.undefined
          : existingDescriptor.value === undefined
            ? realm.intrinsics.undefined
            : existingDescriptor.value;
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
          let valueDesc = new PropertyDescriptor({ value: V });

          // iv. Return ? Receiver.[[DefineOwnProperty]](P, valueDesc).
          if (weakDeletion || existingDescValue.mightHaveBeenDeleted()) {
            // At this point we are not sure that Receiver actually has a property P.
            // If, however, it has -> P. If, however, it has, we are sure that its a
            // data property, and that redefining the property with valueDesc will not
            // change the attributes of the property, so we can reuse the existing
            // descriptor.
            valueDesc = existingDescriptor;
            valueDesc.throwIfNotConcrete(realm).value = V;
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
      let setter = ownDesc.set;

      // 7. If setter is undefined, return false.
      if (!setter || setter instanceof UndefinedValue) return false;

      // 8. Perform ? Call(setter, Receiver, « V »).
      Call(realm, setter.throwIfNotConcrete(), Receiver, [V]);

      // 9. Return true.
      return true;
    }
  }

  OrdinarySetPartial(
    realm: Realm,
    O: ObjectValue,
    P: AbstractValue | PropertyKeyValue,
    V: Value,
    Receiver: Value
  ): boolean {
    if (!(P instanceof AbstractValue)) return O.$Set(P, V, Receiver);
    let pIsLoopVar = isWidenedValue(P);
    let pIsNumeric = Value.isTypeCompatibleWith(P.getType(), NumberValue);

    // A string coercion might have side-effects.
    // TODO #1682: We assume that simple objects mean that they don't have a
    // side-effectful valueOf and toString but that's not enforced.
    if (P.mightNotBeString() && P.mightNotBeNumber() && !P.isSimpleObject()) {
      if (realm.isInPureScope()) {
        // If we're in pure scope, we can leak the key and keep going.
        // Coercion can only have effects on anything reachable from the key.
        Leak.value(realm, P);
      } else {
        let error = new CompilerDiagnostic(
          "property key might not have a well behaved toString or be a symbol",
          realm.currentLocation,
          "PP0002",
          "RecoverableError"
        );
        if (realm.handleError(error) !== "Recover") {
          throw new FatalError();
        }
      }
    }

    // We assume that simple objects have no getter/setter properties and
    // that all properties are writable.
    if (!O.isSimpleObject()) {
      if (realm.isInPureScope()) {
        // If we're in pure scope, we can leak the object and leave an
        // assignment in place.
        Leak.value(realm, Receiver);
        // We also need to leak the value since it might leak to a setter.
        Leak.value(realm, V);
        realm.evaluateWithPossibleThrowCompletion(
          () => {
            let generator = realm.generator;
            invariant(generator);
            invariant(P instanceof AbstractValue);
            generator.emitPropertyAssignment(Receiver, P, V);
            return realm.intrinsics.undefined;
          },
          TypesDomain.topVal,
          ValuesDomain.topVal
        );
        // The emitted assignment might throw at runtime but if it does, that
        // is handled by evaluateWithPossibleThrowCompletion. Anything that
        // happens after this, can assume we didn't throw and therefore,
        // we return true here.
        return true;
      } else {
        let error = new CompilerDiagnostic(
          "unknown property access might need to invoke a setter",
          realm.currentLocation,
          "PP0030",
          "RecoverableError"
        );
        if (realm.handleError(error) !== "Recover") {
          throw new FatalError();
        }
      }
    }

    // We should never consult the prototype chain for unknown properties.
    // If it was simple, it would've been an assignment to the receiver.
    // The only case the Receiver isn't this, if this was a ToObject
    // coercion from a PrimitiveValue.
    let abstractOverO = false;
    if (Receiver instanceof AbstractObjectValue && !Receiver.values.isTop()) {
      let elements = Receiver.values.getElements();
      invariant(elements);
      if (elements.has(O)) {
        abstractOverO = true;
      }
    }
    invariant(O === Receiver || HasCompatibleType(Receiver, PrimitiveValue) || abstractOverO);

    P = To.ToStringAbstract(realm, P);

    function createTemplate(propName: AbstractValue) {
      return AbstractValue.createFromBinaryOp(
        realm,
        "===",
        propName,
        new StringValue(realm, ""),
        undefined,
        "template for property name condition"
      );
    }

    let prop;
    if (O.unknownProperty === undefined) {
      prop = {
        descriptor: undefined,
        object: O,
        key: P,
      };
      O.unknownProperty = prop;
    } else {
      prop = O.unknownProperty;
    }
    realm.recordModifiedProperty(prop);
    let desc = prop.descriptor;
    if (desc === undefined) {
      let newVal = V;
      if (!(V instanceof UndefinedValue) && !isWidenedValue(P)) {
        // join V with sentinel, using a property name test as the condition
        let cond = createTemplate(P);
        let sentinel = AbstractValue.createFromType(realm, Value, "template for prototype member expression", [
          Receiver,
          P,
        ]);
        newVal = AbstractValue.createFromConditionalOp(realm, cond, V, sentinel);
      }
      prop.descriptor = new PropertyDescriptor({
        writable: true,
        enumerable: true,
        configurable: true,
        value: newVal,
      });
    } else {
      invariant(
        desc instanceof PropertyDescriptor,
        "unknown properties are only created with Set and have equal descriptors"
      );
      // join V with current value of O.unknownProperty. I.e. weak update.
      let oldVal = desc.value;
      invariant(oldVal);
      let newVal = oldVal;
      if (!(V instanceof UndefinedValue)) {
        if (isWidenedValue(P)) {
          newVal = V; // It will be widened later on
        } else {
          let cond = createTemplate(P);
          newVal = AbstractValue.createFromConditionalOp(realm, cond, V, oldVal);
        }
      }
      desc.value = newVal;
    }

    // Since we don't know the name of the property we are writing to, we also need
    // to perform weak updates of all of the known properties.
    // First clear out O.unknownProperty so that helper routines know its OK to update the properties
    let savedUnknownProperty = O.unknownProperty;
    O.unknownProperty = undefined;
    for (let [key, propertyBinding] of O.properties) {
      if (pIsLoopVar && pIsNumeric) {
        // Delete numeric properties and don't do weak updates on other properties.
        if (key !== +key + "") continue;
        O.properties.delete(key);
        continue;
      }
      let oldVal = realm.intrinsics.empty;
      if (propertyBinding.descriptor) {
        let d = propertyBinding.descriptor.throwIfNotConcrete(realm);
        if (d.value) {
          oldVal = d.value;
        }
      }
      let cond = AbstractValue.createFromBinaryOp(realm, "===", P, new StringValue(realm, key));
      let newVal = AbstractValue.createFromConditionalOp(realm, cond, V, oldVal);
      this.OrdinarySet(realm, O, key, newVal, Receiver);
    }
    O.unknownProperty = savedUnknownProperty;

    return true;
  }

  // ECMA262 6.2.4.4
  FromPropertyDescriptor(realm: Realm, Desc: ?Descriptor): Value {
    // 1. If Desc is undefined, return undefined.
    if (!Desc) return realm.intrinsics.undefined;

    if (Desc instanceof AbstractJoinedDescriptor) {
      return AbstractValue.createFromConditionalOp(
        realm,
        Desc.joinCondition,
        this.FromPropertyDescriptor(realm, Desc.descriptor1),
        this.FromPropertyDescriptor(realm, Desc.descriptor2)
      );
    }
    invariant(Desc instanceof PropertyDescriptor);

    // 2. Let obj be ObjectCreate(%ObjectPrototype%).
    let obj = Create.ObjectCreate(realm, realm.intrinsics.ObjectPrototype);

    // 3. Assert: obj is an extensible ordinary object with no own properties.
    invariant(obj.getExtensible(), "expected an extensible object");
    invariant(!obj.properties.size, "expected an object with no own properties");

    // 4. If Desc has a [[Value]] field, then
    let success = true;
    if (Desc.value !== undefined) {
      // a. Perform CreateDataProperty(obj, "value", Desc.[[Value]]).
      success = Create.CreateDataProperty(realm, obj, "value", Desc.value) && success;
    }

    // 5. If Desc has a [[Writable]] field, then
    if (Desc.writable !== undefined) {
      // a. Perform CreateDataProperty(obj, "writable", Desc.[[Writable]]).
      success = Create.CreateDataProperty(realm, obj, "writable", new BooleanValue(realm, Desc.writable)) && success;
    }

    // 6. If Desc has a [[Get]] field, then
    if (Desc.get !== undefined) {
      // a. Perform CreateDataProperty(obj, "get", Desc.[[Get]]).
      success = Create.CreateDataProperty(realm, obj, "get", Desc.get) && success;
    }

    // 7. If Desc has a [[Set]] field, then
    if (Desc.set !== undefined) {
      // a. Perform CreateDataProperty(obj, "set", Desc.[[Set]]).
      success = Create.CreateDataProperty(realm, obj, "set", Desc.set) && success;
    }

    // 8. If Desc has an [[Enumerable]] field, then
    if (Desc.enumerable !== undefined) {
      // a. Perform CreateDataProperty(obj, "enumerable", Desc.[[Enumerable]]).
      success =
        Create.CreateDataProperty(realm, obj, "enumerable", new BooleanValue(realm, Desc.enumerable)) && success;
    }

    // 9. If Desc has a [[Configurable]] field, then
    if (Desc.configurable !== undefined) {
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
      if (!realm.ignoreLeakLogic && O.mightBeLeakedObject()) {
        if (realm.generator !== undefined) {
          realm.generator.emitPropertyDelete(O, StringKey(P));
        }
      }
      return true;
    }

    desc = desc.throwIfNotConcrete(realm);

    // 4. If desc.[[Configurable]] is true, then
    if (desc.configurable) {
      ensureIsNotFinal(realm, O, P);
      if (O.mightBeLeakedObject()) {
        if (realm.generator !== undefined) {
          realm.generator.emitPropertyDelete(O, StringKey(P));
        }
        return true;
      }

      // a. Remove the own property with name P from O.
      let key = InternalGetPropertiesKey(P);
      let map = InternalGetPropertiesMap(O, P);
      let propertyBinding = map.get(key);
      if (propertyBinding === undefined && O.isPartialObject() && O.isSimpleObject()) {
        let generator = realm.generator;
        if (generator) {
          invariant(typeof key === "string" || key instanceof SymbolValue);
          generator.emitPropertyDelete(O, StringKey(key));
          return true;
        }
      }
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
  CompletePropertyDescriptor(realm: Realm, _Desc: Descriptor): Descriptor {
    // 1. Assert: Desc is a Property Descriptor.
    let Desc = _Desc.throwIfNotConcrete(realm);

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
      if (Desc.value === undefined) Desc.value = like.value;
      // b. If Desc does not have a [[Writable]] field, set Desc.[[Writable]] to like.[[Writable]].
      if (Desc.writable === undefined) Desc.writable = like.writable;
    } else {
      // 4. Else,
      // a. If Desc does not have a [[Get]] field, set Desc.[[Get]] to like.[[Get]].
      if (Desc.get === undefined) Desc.get = like.get;
      // b. If Desc does not have a [[Set]] field, set Desc.[[Set]] to like.[[Set]].
      if (Desc.set === undefined) Desc.set = like.set;
    }

    // 5. If Desc does not have an [[Enumerable]] field, set Desc.[[Enumerable]] to like.[[Enumerable]].
    if (Desc.enumerable === undefined) Desc.enumerable = like.enumerable;

    // 6. If Desc does not have a [[Configurable]] field, set Desc.[[Configurable]] to like.[[Configurable]].
    if (Desc.configurable === undefined) Desc.configurable = like.configurable;

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
    _Desc: Descriptor,
    _current: ?Descriptor
  ): boolean {
    let Desc = _Desc;
    let current = _current;

    // 1. Assert: If O is not undefined, then IsPropertyKey(P) is true.
    if (O !== undefined) {
      invariant(P !== undefined);
      invariant(IsPropertyKey(realm, P));
    }

    if (current instanceof AbstractJoinedDescriptor) {
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
        if (!realm.ignoreLeakLogic && O.mightBeLeakedObject()) {
          leakDescriptor(realm, Desc);
          if (realm.generator !== undefined) {
            realm.generator.emitDefineProperty(O, StringKey(P), Desc.throwIfNotConcrete(realm));
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
          InternalSetProperty(
            realm,
            O,
            P,
            new PropertyDescriptor({
              value: Desc.value !== undefined ? Desc.value : realm.intrinsics.undefined,
              writable: Desc.writable !== undefined ? Desc.writable : false,
              enumerable: Desc.enumerable !== undefined ? Desc.enumerable : false,
              configurable: Desc.configurable !== undefined ? Desc.configurable : false,
            })
          );
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
          Desc = Desc.throwIfNotConcrete(realm);
          InternalSetProperty(
            realm,
            O,
            P,
            new PropertyDescriptor({
              get: Desc.get !== undefined ? Desc.get : realm.intrinsics.undefined,
              set: Desc.set !== undefined ? Desc.set : realm.intrinsics.undefined,
              enumerable: Desc.enumerable !== undefined ? Desc.enumerable : false,
              configurable: Desc.configurable !== undefined ? Desc.configurable : false,
            })
          );
          InternalUpdatedProperty(realm, O, P, undefined);
        }
      }

      // e. Return true.
      return true;
    }

    current = current.throwIfNotConcrete(realm);
    Desc = Desc.throwIfNotConcrete(realm);

    // 3. Return true, if every field in Desc is absent.
    let allAbsent = true;
    for (let field in Desc) {
      if ((Desc: any)[field] !== undefined) {
        allAbsent = false;
        break;
      }
    }
    if (allAbsent) return true;

    // 4. Return true, if every field in Desc also occurs in current and the value of every field in Desc is the
    // same value as the corresponding field in current when compared using the SameValue algorithm.
    let identical = true;
    for (let field in Desc) {
      if ((Desc: any)[field] === undefined) {
        continue;
      }
      if ((current: any)[field] === undefined) {
        identical = false;
      } else {
        let dval = InternalDescriptorPropertyToValue(realm, (Desc: any)[field]);
        let cval = InternalDescriptorPropertyToValue(realm, (current: any)[field]);
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
    // Only return here if the assigment is not temporal.
    if (identical && (O === realm.$GlobalObject || (O !== undefined && !O.isIntrinsic()))) {
      return true;
    }

    let mightHaveBeenDeleted = current.value instanceof Value && current.value.mightHaveBeenDeleted();

    // 5. If the [[Configurable]] field of current is false, then
    if (!current.configurable) {
      invariant(!mightHaveBeenDeleted, "a non-configurable property can't be deleted");

      // a. Return false, if the [[Configurable]] field of Desc is true.
      if (Desc.configurable) return false;

      // b. Return false, if the [[Enumerable]] field of Desc is present and the [[Enumerable]] fields of current and Desc are the Boolean negation of each other.
      if (Desc.enumerable !== undefined && Desc.enumerable !== current.enumerable) {
        return false;
      }
    }

    current = current.throwIfNotConcrete(realm);
    Desc = Desc.throwIfNotConcrete(realm);

    if (O !== undefined && P !== undefined) {
      ensureIsNotFinal(realm, O, P);
      if (!realm.ignoreLeakLogic && O.mightBeLeakedObject()) {
        leakDescriptor(realm, Desc);
        if (realm.generator !== undefined) {
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
          current.writable = undefined;
          current.value = undefined;
          current.get = realm.intrinsics.undefined;
          current.set = realm.intrinsics.undefined;
        }
      } else {
        // c. Else,
        // i. If O is not undefined, convert the property named P of object O from an accessor property to a data property. Preserve the existing values of the converted property's [[Configurable]] and [[Enumerable]] attributes and set the rest of the property's attributes to their default values.
        if (O !== undefined) {
          invariant(P !== undefined);
          current.get = undefined;
          current.set = undefined;
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

    if (mightHaveBeenDeleted) {
      // If the property might have been deleted, we need to ensure that either
      // the new descriptor overrides any existing values, or always results in
      // the default value.
      let unknownEnumerable = Desc.enumerable === undefined && !!current.enumerable;
      let unknownWritable = Desc.writable === undefined && !!current.writable;
      if (unknownEnumerable || unknownWritable) {
        let error = new CompilerDiagnostic(
          "unknown descriptor attributes on deleted property",
          realm.currentLocation,
          "PP0038",
          "RecoverableError"
        );
        if (realm.handleError(error) !== "Recover") {
          throw new FatalError();
        }
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
      for (let field in Desc) {
        if ((Desc: any)[field] !== undefined) {
          (current: any)[field] = (Desc: any)[field];
        }
      }
      InternalUpdatedProperty(realm, O, P, oldDesc);
    }

    // 11. Return true.
    return true;
  }

  // ECMA262 9.1.6.1
  OrdinaryDefineOwnProperty(realm: Realm, O: ObjectValue, P: PropertyKeyValue, Desc: Descriptor): boolean {
    invariant(O instanceof ObjectValue);

    // 1. Let current be ? O.[[GetOwnProperty]](P).
    let current = O.$GetOwnProperty(P);

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
    let props = To.ToObject(realm, Properties);

    // 3. Let keys be ? props.[[OwnPropertyKeys]]().
    let keys = props.$OwnPropertyKeys();

    // 4. Let descriptors be a new empty List.
    let descriptors = [];

    // 5. Repeat for each element nextKey of keys in List order,
    for (let nextKey of keys) {
      // a. Let propDesc be ? props.[[GetOwnProperty]](nextKey).
      let propDesc = props.$GetOwnProperty(nextKey);

      // b. If propDesc is not undefined and propDesc.[[Enumerable]] is true, then
      if (propDesc && propDesc.throwIfNotConcrete(realm).enumerable) {
        this.ThrowIfMightHaveBeenDeleted(propDesc);

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
      if (base instanceof AbstractValue) {
        // Ensure that abstract values are coerced to objects. This might yield
        // an operation that might throw.
        base = To.ToObject(realm, base);
      }
      // a. If HasPrimitiveBase(V) is true, then
      if (Environment.HasPrimitiveBase(realm, V)) {
        // i. Assert: In realm case, base will never be null or undefined.
        invariant(base instanceof Value && !HasSomeCompatibleType(base, UndefinedValue, NullValue));

        // ii. Set base to ToObject(base).
        base = To.ToObject(realm, base);
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
  ArraySetLength(realm: Realm, A: ArrayValue, _Desc: Descriptor): boolean {
    let Desc = _Desc.throwIfNotConcrete(realm);

    // 1. If the [[Value]] field of Desc is absent, then
    let DescValue = Desc.value;
    if (!DescValue) {
      // a. Return OrdinaryDefineOwnProperty(A, "length", Desc).
      return this.OrdinaryDefineOwnProperty(realm, A, "length", Desc);
    }
    invariant(DescValue instanceof Value);

    // 2. Let newLenDesc be a copy of Desc.
    let newLenDesc = new PropertyDescriptor(Desc);

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
    oldLenDesc = oldLenDesc.throwIfNotConcrete(realm);

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
    if (newLenDesc.writable === undefined || newLenDesc.writable === true) {
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
      return this.OrdinaryDefineOwnProperty(
        realm,
        A,
        "length",
        new PropertyDescriptor({
          writable: false,
        })
      );
    }

    // 18. Return true.
    return true;
  }

  // ECMA262 9.1.5.1
  OrdinaryGetOwnProperty(realm: Realm, O: ObjectValue, P: PropertyKeyValue): Descriptor | void {
    // if the object is leaked and final, then it's still safe to read the value from the object
    if (!realm.ignoreLeakLogic && O.mightBeLeakedObject()) {
      if (!O.mightNotBeFinalObject()) {
        let existingBinding = InternalGetPropertiesMap(O, P).get(InternalGetPropertiesKey(P));
        if (existingBinding && existingBinding.descriptor) {
          return existingBinding.descriptor;
        } else {
          return undefined;
        }
      }

      let propName = P;
      if (typeof propName === "string") {
        propName = new StringValue(realm, propName);
      }
      let absVal = AbstractValue.createTemporalFromBuildFunction(
        realm,
        Value,
        [O._templateFor || O, propName],
        createOperationDescriptor("ABSTRACT_PROPERTY"),
        { isPure: true }
      );
      // TODO: We can't be sure what the descriptor will be, but the value will be abstract.
      return new PropertyDescriptor({ configurable: true, enumerable: true, value: absVal, writable: true });
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
            let absVal;
            function createAbstractPropertyValue(type: typeof Value) {
              invariant(typeof P === "string");
              if (O.isTransitivelySimple()) {
                return AbstractValue.createFromBuildFunction(
                  realm,
                  type,
                  [O._templateFor || O, new StringValue(realm, P)],
                  createOperationDescriptor("ABSTRACT_PROPERTY"),
                  { kind: AbstractValue.makeKind("property", P) }
                );
              } else if (realm.generator !== undefined) {
                return AbstractValue.createTemporalFromBuildFunction(
                  realm,
                  type,
                  [O._templateFor || O, new StringValue(realm, P)],
                  createOperationDescriptor("ABSTRACT_PROPERTY"),
                  { skipInvariant: true, isPure: true }
                );
              } else {
                // During environment initialization we'll call Set and DefineOwnProperty
                // to initialize objects. Since these needs to introspect the descriptor,
                // we need some kind of value as its placeholder. This value should never
                // leak to the serialized environment.
                return AbstractValue.createFromBuildFunction(
                  realm,
                  type,
                  [O._templateFor || O, new StringValue(realm, P)],
                  createOperationDescriptor("ABSTRACT_PROPERTY"),
                  { kind: "environment initialization expression" }
                );
              }
            }
            if (O.isTransitivelySimple()) {
              absVal = createAbstractPropertyValue(ObjectValue);
              invariant(absVal instanceof AbstractObjectValue);
              absVal.makeSimple("transitive");
              absVal = AbstractValue.createAbstractConcreteUnion(realm, absVal, [
                realm.intrinsics.undefined,
                realm.intrinsics.null,
              ]);
            } else {
              absVal = createAbstractPropertyValue(Value);
            }
            return new PropertyDescriptor({ configurable: true, enumerable: true, value: absVal, writable: true });
          } else {
            invariant(P instanceof SymbolValue);
            // Simple objects don't have symbol properties
            return undefined;
          }
        }
        AbstractValue.reportIntrospectionError(O, P);
        throw new FatalError();
      } else if (
        realm.invariantLevel >= 2 &&
        O.isIntrinsic() &&
        !ArrayValue.isIntrinsicAndHasWidenedNumericProperty(O)
      ) {
        let realmGenerator = realm.generator;
        // TODO: Because global variables are special, checking for missing global object properties doesn't quite work yet.
        if (
          realmGenerator &&
          typeof P === "string" &&
          O !== realm.$GlobalObject &&
          !realm.hasBindingBeenChecked(O, P)
        ) {
          realm.markPropertyAsChecked(O, P);
          realmGenerator.emitPropertyInvariant(O, P, "MISSING");
        }
      }
      return undefined;
    }
    realm.callReportPropertyAccess(existingBinding, false);
    if (!existingBinding.descriptor) {
      if (realm.invariantLevel >= 2 && O.isIntrinsic()) {
        let realmGenerator = realm.generator;
        // TODO: Because global variables are special, checking for missing global object properties doesn't quite work yet.
        if (
          realmGenerator &&
          typeof P === "string" &&
          O !== realm.$GlobalObject &&
          !realm.hasBindingBeenChecked(O, P)
        ) {
          realm.markPropertyAsChecked(O, P);
          realmGenerator.emitPropertyInvariant(O, P, "MISSING");
        }
      }
      return undefined;
    }

    // 3. Let D be a newly created Property Descriptor with no fields.
    let D = new PropertyDescriptor({});

    // 4. Let X be O's own property whose key is P.
    let X = existingBinding.descriptor;
    invariant(X !== undefined);

    if (X instanceof AbstractJoinedDescriptor) {
      return new AbstractJoinedDescriptor(X.joinCondition, X.descriptor1, X.descriptor2);
    }
    invariant(X instanceof PropertyDescriptor);

    // 5. If X is a data property, then
    if (IsDataDescriptor(realm, X)) {
      let value = X.value;
      if (O.isIntrinsic() && O.isPartialObject()) {
        if (value instanceof AbstractValue) {
          let savedUnion;
          if (value.kind === "abstractConcreteUnion") {
            // TODO: Simplify this code by using helpers from the AbstractValue factory
            // instead of deriving values directly.
            savedUnion = value;
            value = savedUnion.args[0];
            invariant(value instanceof AbstractValue);
          }
          if (value.kind !== "resolved") {
            let realmGenerator = realm.generator;
            invariant(realmGenerator);
            invariant(value.operationDescriptor);
            const functionResultType = value instanceof AbstractObjectValue ? value.functionResultType : undefined;
            value = realmGenerator.deriveAbstract(value.types, value.values, value.args, value.operationDescriptor, {
              isPure: true,
              kind: "resolved",
              // We can't emit the invariant here otherwise it'll assume the AbstractValue's type not the union type
              skipInvariant: true,
            });
            if (savedUnion !== undefined) {
              invariant(value instanceof AbstractValue);
              let concreteValues = (savedUnion.args.filter(e => e instanceof ConcreteValue): any);
              invariant(concreteValues.length === savedUnion.args.length - 1);
              value = AbstractValue.createAbstractConcreteUnion(realm, value, concreteValues);
            }
            if (functionResultType !== undefined) {
              invariant(value instanceof AbstractObjectValue);
              value.functionResultType = functionResultType;
            }
            if (realm.invariantLevel >= 1 && typeof P === "string" && !realm.hasBindingBeenChecked(O, P)) {
              realm.markPropertyAsChecked(O, P);
              realmGenerator.emitFullInvariant(O, P, value);
            }
            InternalSetProperty(
              realm,
              O,
              P,
              new PropertyDescriptor({
                value: value,
                writable: X.writable !== undefined ? X.writable : false,
                enumerable: X.enumerable !== undefined ? X.enumerable : false,
                configurable: X.configurable !== undefined ? X.configurable : false,
              })
            );
          }
        } else if (realm.invariantLevel >= 1 && value instanceof Value && !(value instanceof AbstractValue)) {
          let realmGenerator = realm.generator;
          invariant(realmGenerator);
          if (typeof P === "string" && !realm.hasBindingBeenChecked(O, P)) {
            realm.markPropertyAsChecked(O, P);
            realmGenerator.emitFullInvariant(O, P, value);
          }
        }
      } else {
        // TODO: Because global variables are special, checking for global object properties doesn't quite work yet.
        if (O !== realm.$GlobalObject && O.isIntrinsic() && realm.invariantLevel >= 2 && value instanceof Value) {
          let realmGenerator = realm.generator;
          if (realmGenerator && typeof P === "string" && !realm.hasBindingBeenChecked(O, P)) {
            realm.markPropertyAsChecked(O, P);
            realmGenerator.emitFullInvariant(O, P, value);
          }
        }
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
    if (!realm.ignoreLeakLogic && O.mightBeLeakedObject()) {
      throw new FatalError();
    }

    // 1. Assert: Either Type(V) is Object or Type(V) is Null.
    invariant(V instanceof ObjectValue || V instanceof NullValue);

    // 2. Let extensible be the value of the [[Extensible]] internal slot of O.
    let extensible = O.getExtensible();

    // 3. Let current be the value of the [[Prototype]] internal slot of O.
    let current = O.$Prototype;

    // 4. If SameValue(V, current) is true, return true.
    if (SameValuePartial(realm, V, current)) return true;

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
      } else if (SameValuePartial(realm, p, O)) {
        // b. Else if SameValue(p, O) is true, return false.
        return false;
      } else {
        // c. Else,
        // If the [[GetPrototypeOf]] internal method of p is not the ordinary object internal method defined in 9.1.1, let done be true.
        if (!p.usesOrdinaryObjectInternalPrototypeMethods()) {
          done = true;
        } else {
          // ii. Else, let p be the value of p's [[Prototype]] internal slot.
          p = p.$Prototype;
          if (p instanceof AbstractObjectValue) {
            AbstractValue.reportIntrospectionError(p);
            throw new FatalError();
          }
        }
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
        if (desc && !desc.throwIfNotConcrete(realm).enumerable) {
          this.ThrowIfMightHaveBeenDeleted(desc);
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

  ThrowIfMightHaveBeenDeleted(desc: Descriptor): void {
    if (desc instanceof AbstractJoinedDescriptor) {
      if (desc.descriptor1) {
        this.ThrowIfMightHaveBeenDeleted(desc.descriptor1);
      }
      if (desc.descriptor2) {
        this.ThrowIfMightHaveBeenDeleted(desc.descriptor2);
      }
    }
    invariant(desc instanceof PropertyDescriptor, "internal slots should never assert using this");
    let value = desc.value;
    if (value === undefined) {
      return;
    }
    if (!value.mightHaveBeenDeleted()) return;
    invariant(value instanceof AbstractValue); // real empty values should never get here
    let v = value.$Realm.simplifyAndRefineAbstractValue(value);
    if (!v.mightHaveBeenDeleted()) return;
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
      let desc: Descriptor = new PropertyDescriptor({
        value: methodDef.$Closure,
        writable: true,
        enumerable: enumerable,
        configurable: true,
      });

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
      let desc: Descriptor = new PropertyDescriptor({
        value: closure,
        writable: true,
        enumerable: enumerable,
        configurable: true,
      });

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
      let desc = new PropertyDescriptor({
        get: closure,
        enumerable: true,
        configurable: true,
      });

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
      let desc = new PropertyDescriptor({
        set: closure,
        enumerable: true,
        configurable: true,
      });

      // 9. Return ? DefinePropertyOrThrow(object, propKey, desc).
      return this.DefinePropertyOrThrow(realm, object, propKey, desc);
    }
  }

  GetOwnPropertyKeysArray(
    realm: Realm,
    O: ObjectValue,
    allowAbstractKeys: boolean,
    getOwnPropertyKeysEvenIfPartial: boolean
  ): Array<string> {
    if (
      (O.isPartialObject() && !getOwnPropertyKeysEvenIfPartial) ||
      O.mightBeLeakedObject() ||
      O.unknownProperty !== undefined
    ) {
      AbstractValue.reportIntrospectionError(O);
      throw new FatalError();
    }

    let keyArray = Array.from(O.properties.keys());
    keyArray = keyArray.filter(x => {
      let pb = O.properties.get(x);
      if (!pb || pb.descriptor === undefined) return false;
      let pv = pb.descriptor.throwIfNotConcrete(realm).value;
      if (pv === undefined) return true;
      invariant(pv instanceof Value);
      if (!pv.mightHaveBeenDeleted()) return true;
      // The property may or may not be there at runtime.
      // We can at best return an abstract keys array.
      // For now, unless the caller has told us that is okay,
      // just terminate.
      invariant(pv instanceof AbstractValue);
      if (allowAbstractKeys) return true;
      AbstractValue.reportIntrospectionError(pv);
      throw new FatalError();
    });
    realm.callReportObjectGetOwnProperties(O);
    return keyArray;
  }
}
