/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import type { Effects, Realm } from "../realm.js";
import type { PropertyBinding, PropertyKeyValue, Descriptor, ObjectKind } from "../types.js";
import {
  AbstractValue,
  BoundFunctionValue,
  ECMAScriptSourceFunctionValue,
  NumberValue,
  ObjectValue,
  StringValue,
  Value,
} from "./index.js";
import { IsAccessorDescriptor, IsPropertyKey, IsArrayIndex } from "../methods/is.js";
import { Leak, Reachability, Properties, To, Utils } from "../singletons.js";
import { type OperationDescriptor } from "../utils/generator.js";
import invariant from "../invariant.js";
import { NestedOptimizedFunctionSideEffect } from "../errors.js";
import { PropertyDescriptor } from "../descriptors.js";
import { SimpleNormalCompletion } from "../completions.js";

type ArrayNestedOptimizedFunctionType = "map" | "filter";
type PossibleNestedOptimizedFunctions = [
  {
    func: BoundFunctionValue | ECMAScriptSourceFunctionValue,
    thisValue: Value,
    kind: ArrayNestedOptimizedFunctionType,
  },
];

function evaluatePossibleNestedOptimizedFunctionsAndStoreEffects(
  realm: Realm,
  abstractArrayValue: ArrayValue,
  possibleNestedOptimizedFunctions: PossibleNestedOptimizedFunctions
): void {
  for (let { func, thisValue } of possibleNestedOptimizedFunctions) {
    let funcToModel = func;
    if (func instanceof BoundFunctionValue) {
      funcToModel = func.$BoundTargetFunction;
      thisValue = func.$BoundThis;
    }
    invariant(funcToModel instanceof ECMAScriptSourceFunctionValue);

    if (funcToModel.isCalledInMultipleContexts) return;

    let previouslyComputedEffects = realm.collectedNestedOptimizedFunctionEffects.get(funcToModel);
    if (previouslyComputedEffects !== undefined) {
      if (realm.instantRender.enabled) {
        realm.instantRenderBailout("Array operators may only be optimized once", funcToModel.expressionLocation);
      } else {
        // We currently do not support context-sensitive specialization,
        // where the calls we specialize depend on the specialization context.
        // TODO: #2454
        // TODO: Implement context-sensitive specialization instead of giving up
        funcToModel.isCalledInMultipleContexts = true;
        Leak.value(realm, func);
        return;
      }
    }

    let funcCall = () => {
      invariant(funcToModel instanceof ECMAScriptSourceFunctionValue);
      return realm.evaluateFunctionForPureEffects(
        func,
        Utils.createModelledFunctionCall(realm, funcToModel, undefined, thisValue),
        null,
        "temporalArray nestedOptimizedFunction",
        () => {
          throw new NestedOptimizedFunctionSideEffect();
        }
      );
    };
    // We take the modelled function and wrap it in a pure evaluation so we can check for
    // side-effects that occur when evaluating the function. If there are side-effects, then
    // we don't try and optimize the nested function.
    let effects;
    try {
      effects = realm.isInPureScope() ? funcCall() : realm.evaluateWithPureScope(funcCall);
    } catch (e) {
      // If the nested optimized function had side-effects, we need to fallback to
      // the default behaviour and leaked the nested functions so any bindings
      // within the function properly leak and materialize.
      if (e instanceof NestedOptimizedFunctionSideEffect) {
        if (realm.instantRender.enabled) {
          realm.instantRenderBailout(
            "InstantRender does not support impure array operators",
            funcCall.expressionLocation
          );
        }
        Leak.value(realm, func);
        return;
      }
      throw e;
    }

    // Check if effects were pure then add them
    if (abstractArrayValue.nestedOptimizedFunctionEffects === undefined) {
      abstractArrayValue.nestedOptimizedFunctionEffects = new Map();
    }
    abstractArrayValue.nestedOptimizedFunctionEffects.set(funcToModel, effects);
    realm.collectedNestedOptimizedFunctionEffects.set(funcToModel, effects);
  }
}

/*
  We track aliases explicitly, because we currently do not have the primitives to model objects created
inside of the loop. TODO: Revisit when #2543 and subsequent modeling work
lands. At that point, instead of of a mayAliasSet, we can return a widened
abstract value.
*/
function modelUnknownPropertyOfSpecializedArray(
  realm: Realm,
  args: Array<Value>,
  array: ArrayValue,
  possibleNestedOptimizedFunctions: ?PossibleNestedOptimizedFunctions
): PropertyBinding {
  let sentinelProperty = {
    key: undefined,
    descriptor: new PropertyDescriptor({
      writable: true,
      enumerable: true,
      configurable: true,
    }),
    object: array,
  };

  let mayAliasedObjects: Set<ObjectValue> = new Set();

  if (realm.arrayNestedOptimizedFunctionsEnabled && possibleNestedOptimizedFunctions) {
    invariant(possibleNestedOptimizedFunctions.length > 0);
    if (possibleNestedOptimizedFunctions[0].kind === "map") {
      for (let { func } of possibleNestedOptimizedFunctions) {
        let funcToModel;
        if (func instanceof BoundFunctionValue) {
          funcToModel = func.$BoundTargetFunction;
        } else {
          funcToModel = func;
        }
        invariant(funcToModel instanceof ECMAScriptSourceFunctionValue);
        if (array.nestedOptimizedFunctionEffects !== undefined) {
          let effects = array.nestedOptimizedFunctionEffects.get(funcToModel);
          if (effects !== undefined) {
            invariant(effects.result instanceof SimpleNormalCompletion);
            let objectsTrackedForLeaks = realm.createdObjectsTrackedForLeaks;
            let filterValues = o =>
              !(o instanceof ObjectValue) ||
              (!effects.createdObjects.has(o) &&
                (objectsTrackedForLeaks === undefined || objectsTrackedForLeaks.has(o)));
            let [reachableObjects, reachableBindings] = Reachability.computeReachableObjectsAndBindings(
              realm,
              effects.result.value,
              filterValues,
              true /* readOnly */
            );
            invariant(reachableBindings !== undefined);
            for (let reachableObject of reachableObjects) {
              mayAliasedObjects.add(reachableObject);
            }
          }
        }
      }
    }
    // For filter, we just collect the may alias set of the mapped array
    if (args.length > 0) {
      let mappedArray = args[0];
      if (ArrayValue.isIntrinsicAndHasWidenedNumericProperty(mappedArray)) {
        invariant(mappedArray instanceof ArrayValue);
        invariant(mappedArray.unknownProperty !== undefined);
        invariant(mappedArray.unknownProperty.descriptor instanceof PropertyDescriptor);

        let unknownPropertyValue = mappedArray.unknownProperty.descriptor.value;
        invariant(unknownPropertyValue instanceof AbstractValue);

        let aliasSet = unknownPropertyValue.args[0];
        invariant(aliasSet instanceof AbstractValue && aliasSet.kind === "mayAliasSet");
        for (let aliasedObject of aliasSet.args) {
          invariant(aliasedObject instanceof ObjectValue);
          mayAliasedObjects.add(aliasedObject);
        }
      }
    }
  }

  let aliasSet = AbstractValue.createFromType(realm, Value, "mayAliasSet", [...mayAliasedObjects]);
  sentinelProperty.descriptor.value = AbstractValue.createFromType(realm, Value, "widened numeric property", [
    aliasSet,
  ]);

  return sentinelProperty;
}

function createArrayWithWidenedNumericProperty(
  realm: Realm,
  args: Array<Value>,
  intrinsicName: string,
  possibleNestedOptimizedFunctions?: PossibleNestedOptimizedFunctions
): ArrayValue {
  let abstractArrayValue = new ArrayValue(realm, intrinsicName);

  if (
    realm.arrayNestedOptimizedFunctionsEnabled &&
    (!realm.react.enabled || realm.react.optimizeNestedFunctions) &&
    possibleNestedOptimizedFunctions !== undefined
  ) {
    if (possibleNestedOptimizedFunctions.length > 0) {
      evaluatePossibleNestedOptimizedFunctionsAndStoreEffects(
        realm,
        abstractArrayValue,
        possibleNestedOptimizedFunctions
      );
    } else {
      // If nested optimized functions are disabled, we need to fallback to
      // the default behaviour and leaked the nested functions so any bindings
      // within the function properly leak and materialize.
      for (let { func } of possibleNestedOptimizedFunctions) {
        Leak.value(realm, func);
      }
    }
  }
  // Add unknownProperty so we manually handle this object property access
  abstractArrayValue.unknownProperty = modelUnknownPropertyOfSpecializedArray(
    realm,
    args,
    abstractArrayValue,
    possibleNestedOptimizedFunctions
  );
  return abstractArrayValue;
}

export default class ArrayValue extends ObjectValue {
  constructor(realm: Realm, intrinsicName?: string) {
    super(realm, realm.intrinsics.ArrayPrototype, intrinsicName);
  }
  nestedOptimizedFunctionEffects: void | Map<ECMAScriptSourceFunctionValue, Effects>;

  getKind(): ObjectKind {
    return "Array";
  }

  isSimpleObject(): boolean {
    return this.$TypedArrayName === undefined;
  }

  // ECMA262 9.4.2.1
  $DefineOwnProperty(P: PropertyKeyValue, Desc: Descriptor): boolean {
    let A = this;

    // 1. Assert: IsPropertyKey(P) is true.
    invariant(IsPropertyKey(this.$Realm, P), "expected a property key");

    // 2. If P is "length", then
    if (P === "length" || (P instanceof StringValue && P.value === "length")) {
      // a. Return ? ArraySetLength(A, Desc).
      return Properties.ArraySetLength(this.$Realm, A, Desc);
    } else if (IsArrayIndex(this.$Realm, P)) {
      if (ArrayValue.isIntrinsicAndHasWidenedNumericProperty(this)) {
        // The length of an array with widenend numeric properties is always abstract
        let succeeded = Properties.OrdinaryDefineOwnProperty(this.$Realm, A, P, Desc);
        if (succeeded === false) return false;
        return true;
      }
      // 3. Else if P is an array index, then

      // a. Let oldLenDesc be OrdinaryGetOwnProperty(A, "length").
      let oldLenDesc = Properties.OrdinaryGetOwnProperty(this.$Realm, A, "length");

      // b. Assert: oldLenDesc will never be undefined or an accessor descriptor because Array objects are
      //    created with a length data property that cannot be deleted or reconfigured.
      invariant(
        oldLenDesc !== undefined && !IsAccessorDescriptor(this.$Realm, oldLenDesc),
        "cannot be undefined or an accessor descriptor"
      );
      Properties.ThrowIfMightHaveBeenDeleted(oldLenDesc);
      oldLenDesc = oldLenDesc.throwIfNotConcrete(this.$Realm);

      // c. Let oldLen be oldLenDesc.[[Value]].
      let oldLen = oldLenDesc.value;
      invariant(oldLen instanceof Value);
      oldLen = oldLen.throwIfNotConcrete();
      invariant(oldLen instanceof NumberValue, "expected number value");
      oldLen = oldLen.value;

      // d. Let index be ! ToUint32(P).
      let index = To.ToUint32(this.$Realm, typeof P === "string" ? new StringValue(this.$Realm, P) : P);

      // e. If index ≥ oldLen and oldLenDesc.[[Writable]] is false, return false.
      if (index >= oldLen && oldLenDesc.writable === false) return false;

      // f. Let succeeded be ! OrdinaryDefineOwnProperty(A, P, Desc).
      let succeeded = Properties.OrdinaryDefineOwnProperty(this.$Realm, A, P, Desc);

      // g. If succeeded is false, return false.
      if (succeeded === false) return false;

      // h. If index ≥ oldLen, then
      if (index >= oldLen) {
        // i. Set oldLenDesc.[[Value]] to index + 1.
        oldLenDesc.value = new NumberValue(this.$Realm, index + 1);

        // ii. Let succeeded be OrdinaryDefineOwnProperty(A, "length", oldLenDesc).
        succeeded = Properties.OrdinaryDefineOwnProperty(this.$Realm, A, "length", oldLenDesc);

        // iii. Assert: succeeded is true.
        invariant(succeeded, "expected length definition to succeed");
      }

      // i. Return true.
      return true;
    }

    // 1. Return OrdinaryDefineOwnProperty(A, P, Desc).
    return Properties.OrdinaryDefineOwnProperty(this.$Realm, A, P, Desc);
  }

  static createTemporalWithWidenedNumericProperty(
    realm: Realm,
    args: Array<Value>,
    operationDescriptor: OperationDescriptor,
    possibleNestedOptimizedFunctions?: PossibleNestedOptimizedFunctions
  ): ArrayValue {
    invariant(realm.generator !== undefined);

    let value = realm.generator.deriveConcreteObject(
      intrinsicName =>
        createArrayWithWidenedNumericProperty(realm, args, intrinsicName, possibleNestedOptimizedFunctions),
      args,
      operationDescriptor,
      { isPure: true }
    );
    invariant(value instanceof ArrayValue);
    return value;
  }

  static isIntrinsicAndHasWidenedNumericProperty(obj: Value): boolean {
    if (obj instanceof ArrayValue && obj.intrinsicName !== undefined && obj.isScopedTemplate !== undefined) {
      invariant(ObjectValue.isIntrinsicDerivedObject(obj));
      const prop = obj.unknownProperty;
      if (prop !== undefined && prop.descriptor !== undefined) {
        const desc = prop.descriptor.throwIfNotConcrete(obj.$Realm);
        return desc.value instanceof AbstractValue && desc.value.kind === "widened numeric property";
      }
    }
    return false;
  }
}
