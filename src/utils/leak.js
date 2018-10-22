/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import { CompilerDiagnostic, FatalError } from "../errors.js";
import type { Realm } from "../realm.js";
import { leakBinding } from "../environment.js";
import { AbstractValue, ArrayValue, EmptyValue, ObjectValue, Value } from "../values/index.js";
import { TestIntegrityLevel } from "../methods/index.js";
import type { BabelNodeSourceLocation } from "@babel/types";
import invariant from "../invariant.js";
import { HeapInspector } from "../utils/HeapInspector.js";
import { Logger } from "../utils/logger.js";
import { isReactElement } from "../react/utils.js";
import { Reachability } from "../singletons.js";
import { PropertyDescriptor } from "../descriptors.js";

function materializeObject(realm: Realm, object: ObjectValue, getCachingHeapInspector?: () => HeapInspector): void {
  let generator = realm.generator;

  if (object.symbols.size > 0) {
    throw new FatalError("TODO: Support havocing objects with symbols");
  }

  if (object.unknownProperty !== undefined) {
    // TODO: Support unknown properties, or throw FatalError.
    // We have repros, e.g. test/serializer/additional-functions/ArrayConcat.js.
  }

  let getHeapInspector =
    getCachingHeapInspector || (() => new HeapInspector(realm, new Logger(realm, /*internalDebug*/ false)));

  // TODO: We should emit current value and then reset value for all *internal slots*; this will require deep serializer support; or throw FatalError when we detect any non-initial values in internal slots.
  for (let [name, propertyBinding] of object.properties) {
    // ignore properties with their correct default values
    if (getHeapInspector().canIgnoreProperty(object, name)) continue;

    let descriptor = propertyBinding.descriptor;
    if (descriptor === undefined) {
      // TODO: This happens, e.g. test/serializer/pure-functions/ObjectAssign2.js
      // If it indeed means deleted binding, should we initialize descriptor with a deleted value?
      if (generator !== undefined) generator.emitPropertyDelete(object, name);
    } else {
      invariant(descriptor instanceof PropertyDescriptor); // TODO: Deal with joined descriptors.
      let value = descriptor.value;
      invariant(
        value === undefined || value instanceof Value,
        "cannot be an array because we are not dealing with intrinsics here"
      );
      if (value === undefined) {
        // TODO: Deal with accessor properties
        // We have repros, e.g. test/serializer/pure-functions/AbstractPropertyObjectKeyAssignment.js
      } else {
        invariant(value instanceof Value);
        if (value instanceof EmptyValue) {
          if (generator !== undefined) generator.emitPropertyDelete(object, name);
        } else {
          if (generator !== undefined) {
            let targetDescriptor = getHeapInspector().getTargetIntegrityDescriptor(object);
            if (!isReactElement(object)) {
              if (
                descriptor.writable !== targetDescriptor.writable ||
                descriptor.configurable !== targetDescriptor.configurable
              ) {
                generator.emitDefineProperty(object, name, descriptor);
              } else {
                generator.emitPropertyAssignment(object, name, value);
              }
            }
          }
        }
      }
    }
  }
}

function ensureFrozenValue(realm, value, loc): void {
  // TODO: This should really check if it is recursively immutability.
  if (value instanceof ObjectValue && !TestIntegrityLevel(realm, value, "frozen")) {
    let diag = new CompilerDiagnostic(
      "Unfrozen object leaked before end of global code",
      loc || realm.currentLocation,
      "PP0017",
      "RecoverableError"
    );
    if (realm.handleError(diag) !== "Recover") throw new FatalError();
  }
}

// Ensure that a value is immutable. If it is not, set all its properties to abstract values
// and all reachable bindings to abstract values.
export class LeakImplementation {
  value(realm: Realm, value: Value, loc: ?BabelNodeSourceLocation): void {
    if (realm.instantRender.enabled) {
      // TODO: For InstantRender...
      // - For declarative bindings, we do want proper materialization/leaking/havocing
      // - For object properties, we conceptually want materialization
      //   (however, not via statements that mutate the objects,
      //   but only as part of the initial object literals),
      //   but actual no leaking or leaking as there should be a way to annotate/enforce
      //   that external/abstract functions are pure with regards to heap objects
      return;
    }
    let objectsTrackedForLeaks = realm.createdObjectsTrackedForLeaks;
    if (objectsTrackedForLeaks === undefined) {
      // We're not tracking a pure function. That means that we would track
      // everything as leaked. We'll assume that any object argument
      // is invalid unless it's frozen.
      ensureFrozenValue(realm, value, loc);
    } else {
      // This function decides what values are descended into by leaking
      function leakingFilter(val: Value) {
        if (val instanceof AbstractValue) {
          // To ensure that we don't forget to provide arguments
          // that can be leaked, we require at least one argument.
          let whitelistedKind = val.kind && val.kind.startsWith("abstractCounted");

          invariant(
            whitelistedKind !== undefined || val.intrinsicName !== undefined || val.args.length > 0,
            "Leaked unknown object requires leakable arguments"
          );
        }

        // We skip a value if one of the following holds:
        // 1. It has certainly been leaked
        // 2. It was not created in the current pure scope
        // 3. It is not a frozen object
        // 4. It certainly does not evaluate to an object
        // 5. Is it an intrinsic, but not a widened array
        return (
          (!(val instanceof ObjectValue) ||
            (val.mightNotBeLeakedObject() &&
              objectsTrackedForLeaks.has(val) &&
              !TestIntegrityLevel(realm, val, "frozen"))) &&
          val.mightBeObject() &&
          (!val.isIntrinsic() || (val instanceof ArrayValue && ArrayValue.isIntrinsicAndHasWidenedNumericProperty(val)))
        );
      }
      let [reachableObjects, reachableBindings] = Reachability.computeReachableObjectsAndBindings(
        realm,
        value,
        leakingFilter,
        false /* readOnly */
      );

      let cachedHeapInspector;
      let makeAndCacheHeapInspector = () => {
        if (cachedHeapInspector === undefined) {
          cachedHeapInspector = new HeapInspector(realm, new Logger(realm, /*internalDebug*/ false));
        }
        return cachedHeapInspector;
      };

      for (let val of reachableObjects) {
        val.leak();
        materializeObject(realm, val, makeAndCacheHeapInspector);
      }

      for (let binding of reachableBindings) {
        leakBinding(binding);
      }
    }
  }
}

export class MaterializeImplementation {
  // TODO: Understand relation to snapshots: #2441
  materializeObject(realm: Realm, val: ObjectValue): void {
    if (realm.instantRender.enabled)
      // Materialization leads to runtime code that mutates objects
      // this is at best undesirable in InstantRender
      val.makeFinal();
    else materializeObject(realm, val);
  }
}
