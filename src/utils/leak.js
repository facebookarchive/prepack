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
import type { Descriptor, PropertyBinding, ObjectKind } from "../types.js";
import {
  leakBinding,
  DeclarativeEnvironmentRecord,
  FunctionEnvironmentRecord,
  ObjectEnvironmentRecord,
  GlobalEnvironmentRecord,
} from "../environment.js";
import {
  AbstractValue,
  ArrayValue,
  BoundFunctionValue,
  ECMAScriptSourceFunctionValue,
  EmptyValue,
  FunctionValue,
  NativeFunctionValue,
  ObjectValue,
  PrimitiveValue,
  ProxyValue,
  Value,
} from "../values/index.js";
import { TestIntegrityLevel } from "../methods/index.js";
import * as t from "@babel/types";
import traverse from "@babel/traverse";
import type { BabelTraversePath } from "@babel/traverse";
import type { BabelNodeSourceLocation } from "@babel/types";
import invariant from "../invariant.js";
import { HeapInspector } from "../utils/HeapInspector.js";
import { Logger } from "../utils/logger.js";
import { isReactElement } from "../react/utils.js";
import { PropertyDescriptor, AbstractJoinedDescriptor } from "../descriptors.js";

type LeakedFunctionInfo = {
  unboundReads: Set<string>,
  unboundWrites: Set<string>,
};

function visitName(
  path: BabelTraversePath,
  state: LeakedFunctionInfo,
  name: string,
  read: boolean,
  write: boolean
): void {
  // Is the name bound to some local identifier? If so, we don't need to do anything
  if (path.scope.hasBinding(name, /*noGlobals*/ true)) return;

  // Otherwise, let's record that there's an unbound identifier
  if (read) state.unboundReads.add(name);
  if (write) state.unboundWrites.add(name);
}

function ignorePath(path: BabelTraversePath): boolean {
  let parent = path.parent;
  return t.isLabeledStatement(parent) || t.isBreakStatement(parent) || t.isContinueStatement(parent);
}

let LeakedClosureRefVisitor = {
  ReferencedIdentifier(path: BabelTraversePath, state: LeakedFunctionInfo): void {
    if (ignorePath(path)) return;

    let innerName = path.node.name;
    if (innerName === "arguments") {
      return;
    }
    visitName(path, state, innerName, true, false);
  },

  "AssignmentExpression|UpdateExpression"(path: BabelTraversePath, state: LeakedFunctionInfo): void {
    let doesRead = path.node.operator !== "=";
    for (let name in path.getBindingIdentifiers()) {
      visitName(path, state, name, doesRead, true);
    }
  },
};

function getLeakedFunctionInfo(value: FunctionValue) {
  // TODO: This should really be cached on a per AST basis in case we have
  // many uses of the same closure. It should ideally share this cache
  // and data with ResidualHeapVisitor.
  invariant(value instanceof ECMAScriptSourceFunctionValue);
  invariant(value.constructor === ECMAScriptSourceFunctionValue);
  let functionInfo = {
    unboundReads: new Set(),
    unboundWrites: new Set(),
  };
  let formalParameters = value.$FormalParameters;
  invariant(formalParameters != null);
  let code = value.$ECMAScriptCode;
  invariant(code != null);

  traverse(
    t.file(t.program([t.expressionStatement(t.functionExpression(null, formalParameters, code))])),
    LeakedClosureRefVisitor,
    null,
    functionInfo
  );
  traverse.cache.clear();
  return functionInfo;
}

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
class ObjectValueLeakingVisitor {
  realm: Realm;
  // ObjectValues to visit if they're reachable.
  objectsTrackedForLeaks: Set<ObjectValue>;
  // Values that has been visited.
  visitedValues: Set<Value>;
  _heapInspector: HeapInspector;

  constructor(realm: Realm, objectsTrackedForLeaks: Set<ObjectValue>) {
    this.realm = realm;
    this.objectsTrackedForLeaks = objectsTrackedForLeaks;
    this.visitedValues = new Set();
  }

  mustVisit(val: Value): boolean {
    if (val instanceof ObjectValue) {
      // For Objects we only need to visit it if it is tracked
      // as a newly created object that might still be mutated.
      // Abstract values gets their arguments visited.
      if (!this.objectsTrackedForLeaks.has(val)) return false;
    }
    if (this.visitedValues.has(val)) return false;
    this.visitedValues.add(val);
    return true;
  }

  visitObjectProperty(binding: PropertyBinding): void {
    let desc = binding.descriptor;
    if (desc === undefined) return; //deleted
    this.visitDescriptor(desc);
  }

  visitObjectProperties(obj: ObjectValue, kind?: ObjectKind): void {
    // visit symbol properties
    for (let [, propertyBindingValue] of obj.symbols) {
      invariant(propertyBindingValue);
      this.visitObjectProperty(propertyBindingValue);
    }

    // visit string properties
    for (let [, propertyBindingValue] of obj.properties) {
      invariant(propertyBindingValue);
      this.visitObjectProperty(propertyBindingValue);
    }

    // inject properties with computed names
    if (obj.unknownProperty !== undefined) {
      let desc = obj.unknownProperty.descriptor;
      this.visitObjectPropertiesWithComputedNamesDescriptor(desc);
    }

    // prototype
    this.visitObjectPrototype(obj);

    if (TestIntegrityLevel(this.realm, obj, "frozen")) return;

    // if this object wasn't already leaked, we need mark it as leaked
    // so that any mutation and property access get tracked after this.
    if (obj.mightNotBeLeakedObject()) {
      obj.leak();

      // materialization is a common operation and needs to be invoked
      // whenever non-final values need to be made available at intermediate
      // points in a program's control flow. An object can be materialized by
      // calling materializeObject(). Sometimes, objects
      // are materialized in cohorts (such as during leaking).
      // In these cases, we provide a caching mechanism for HeapInspector().
      let makeAndCacheHeapInspector = () => {
        let heapInspector = this._heapInspector;
        if (heapInspector !== undefined) return heapInspector;
        else {
          heapInspector = new HeapInspector(this.realm, new Logger(this.realm, /*internalDebug*/ false));
          this._heapInspector = heapInspector;
          return heapInspector;
        }
      };
      invariant(this.realm.generator !== undefined);
      materializeObject(this.realm, obj, makeAndCacheHeapInspector);
    }
  }

  visitObjectPrototype(obj: ObjectValue): void {
    let proto = obj.$Prototype;
    this.visitValue(proto);
  }

  visitObjectPropertiesWithComputedNamesDescriptor(desc: void | Descriptor): void {
    if (desc !== undefined) {
      if (desc instanceof PropertyDescriptor) {
        let val = desc.value;
        invariant(val instanceof AbstractValue);
        this.visitObjectPropertiesWithComputedNames(val);
      } else if (desc instanceof AbstractJoinedDescriptor) {
        this.visitValue(desc.joinCondition);
        this.visitObjectPropertiesWithComputedNamesDescriptor(desc.descriptor1);
        this.visitObjectPropertiesWithComputedNamesDescriptor(desc.descriptor2);
      } else {
        invariant(false, "unknown descriptor");
      }
    }
  }

  visitObjectPropertiesWithComputedNames(absVal: AbstractValue): void {
    if (absVal.kind === "widened property") return;
    if (absVal.kind === "template for prototype member expression") return;
    if (absVal.kind === "conditional") {
      let cond = absVal.args[0];
      invariant(cond instanceof AbstractValue);
      if (cond.kind === "template for property name condition") {
        let P = cond.args[0];
        invariant(P instanceof AbstractValue);
        let V = absVal.args[1];
        let earlier_props = absVal.args[2];
        if (earlier_props instanceof AbstractValue) this.visitObjectPropertiesWithComputedNames(earlier_props);
        this.visitValue(P);
        this.visitValue(V);
      } else {
        // conditional assignment
        this.visitValue(cond);
        let consequent = absVal.args[1];
        if (consequent instanceof AbstractValue) {
          this.visitObjectPropertiesWithComputedNames(consequent);
        }
        let alternate = absVal.args[2];
        if (alternate instanceof AbstractValue) {
          this.visitObjectPropertiesWithComputedNames(alternate);
        }
      }
    } else {
      this.visitValue(absVal);
    }
  }

  visitDescriptor(desc: void | Descriptor): void {
    if (desc === undefined) {
    } else if (desc instanceof PropertyDescriptor) {
      if (desc.value !== undefined) this.visitValue(desc.value);
      if (desc.get !== undefined) this.visitValue(desc.get);
      if (desc.set !== undefined) this.visitValue(desc.set);
    } else if (desc instanceof AbstractJoinedDescriptor) {
      this.visitValue(desc.joinCondition);
      if (desc.descriptor1 !== undefined) this.visitDescriptor(desc.descriptor1);
      if (desc.descriptor2 !== undefined) this.visitDescriptor(desc.descriptor2);
    } else {
      invariant(false, "unknown descriptor");
    }
  }

  visitDeclarativeEnvironmentRecordBinding(
    record: DeclarativeEnvironmentRecord,
    remainingLeakedBindings: LeakedFunctionInfo
  ): void {
    let bindings = record.bindings;
    for (let bindingName of Object.keys(bindings)) {
      let binding = bindings[bindingName];
      // Check if this binding is referenced, and if so delete it from the set.
      let isRead = remainingLeakedBindings.unboundReads.delete(bindingName);
      let isWritten = remainingLeakedBindings.unboundWrites.delete(bindingName);
      if (isRead) {
        // If this binding can be read from the closure, its value has now leaked.
        let value = binding.value;
        if (value) {
          this.visitValue(value);
        }
      }
      if (isWritten || isRead) {
        // If this binding could have been mutated from the closure, then the
        // binding itself has now leaked, but not necessarily the value in it.
        // TODO: We could tag a leaked binding as read and/or write. That way
        // we don't have to leak values written to this binding if only the binding
        // has been written to. We also don't have to leak reads from this binding
        // if it is only read from.
        leakBinding(binding);
      }
    }
  }

  visitValueMap(val: ObjectValue): void {
    let kind = val.getKind();

    let entries;
    if (kind === "Map") {
      entries = val.$MapData;
    } else {
      invariant(kind === "WeakMap");
      entries = val.$WeakMapData;
    }
    invariant(entries !== undefined);
    let len = entries.length;

    for (let i = 0; i < len; i++) {
      let entry = entries[i];
      let key = entry.$Key;
      let value = entry.$Value;
      if (key === undefined || value === undefined) continue;
      this.visitValue(key);
      this.visitValue(value);
    }
  }

  visitValueSet(val: ObjectValue): void {
    let kind = val.getKind();

    let entries;
    if (kind === "Set") {
      entries = val.$SetData;
    } else {
      invariant(kind === "WeakSet");
      entries = val.$WeakSetData;
    }
    invariant(entries !== undefined);
    let len = entries.length;

    for (let i = 0; i < len; i++) {
      let entry = entries[i];
      if (entry === undefined) continue;
      this.visitValue(entry);
    }
  }

  visitValueFunction(val: FunctionValue): void {
    if (!val.mightNotBeLeakedObject()) {
      return;
    }
    this.visitObjectProperties(val);

    if (val instanceof BoundFunctionValue) {
      this.visitValue(val.$BoundTargetFunction);
      this.visitValue(val.$BoundThis);
      for (let boundArg of val.$BoundArguments) this.visitValue(boundArg);
      return;
    }

    invariant(
      !(val instanceof NativeFunctionValue),
      "all native function values should have already been created outside this pure function"
    );

    let remainingLeakedBindings = getLeakedFunctionInfo(val);

    let environment = val.$Environment;
    while (environment) {
      let record = environment.environmentRecord;
      if (record instanceof ObjectEnvironmentRecord) {
        this.visitValue(record.object);
        continue;
      }
      if (record instanceof GlobalEnvironmentRecord) {
        break;
      }

      invariant(record instanceof DeclarativeEnvironmentRecord);
      this.visitDeclarativeEnvironmentRecordBinding(record, remainingLeakedBindings);

      if (record instanceof FunctionEnvironmentRecord) {
        // If this is a function environment, which is not tracked for leaks,
        // we can bail out because its bindings should not be mutated in a
        // pure function.
        let fn = record.$FunctionObject;
        if (!this.objectsTrackedForLeaks.has(fn)) {
          break;
        }
      }
      environment = environment.parent;
    }
  }

  visitValueObject(val: ObjectValue): void {
    if (!val.mightNotBeLeakedObject()) {
      return;
    }

    let kind = val.getKind();
    this.visitObjectProperties(val, kind);

    switch (kind) {
      case "RegExp":
      case "Number":
      case "String":
      case "Boolean":
      case "ReactElement":
      case "ArrayBuffer":
      case "Array":
        return;
      case "Date":
        let dateValue = val.$DateValue;
        invariant(dateValue !== undefined);
        this.visitValue(dateValue);
        return;
      case "Float32Array":
      case "Float64Array":
      case "Int8Array":
      case "Int16Array":
      case "Int32Array":
      case "Uint8Array":
      case "Uint16Array":
      case "Uint32Array":
      case "Uint8ClampedArray":
      case "DataView":
        let buf = val.$ViewedArrayBuffer;
        invariant(buf !== undefined);
        this.visitValue(buf);
        return;
      case "Map":
      case "WeakMap":
        this.visitValueMap(val);
        return;
      case "Set":
      case "WeakSet":
        this.visitValueSet(val);
        return;
      default:
        invariant(kind === "Object", `Object of kind ${kind} is not supported in calls to abstract functions.`);
        invariant(val.$ParameterMap === undefined, `Arguments object is not supported in calls to abstract functions.`);
        return;
    }
  }

  visitValueProxy(val: ProxyValue): void {
    this.visitValue(val.$ProxyTarget);
    this.visitValue(val.$ProxyHandler);
  }

  visitAbstractValue(val: AbstractValue): void {
    if (!val.mightBeObject()) {
      // Only objects need to be leaked.
      return;
    }
    if (val.values.isTop()) {
      // If we don't know which object instances it might be,
      // then it might be one of the arguments that created
      // this value. See #2179.

      if (val.kind === "conditional") {
        // For a conditional, we only have to visit each case. Not the condition itself.
        this.visitValue(val.args[1]);
        this.visitValue(val.args[2]);
        return;
      }

      // To ensure that we don't forget to provide arguments
      // that can be havoced, we require at least one argument.
      let whitelistedKind =
        val.kind &&
        (val.kind === "widened numeric property" || // TODO: Widened properties needs to be havocable.
          val.kind.startsWith("abstractCounted"));
      invariant(
        whitelistedKind || val.intrinsicName || val.args.length > 0,
        "Havoced unknown object requires havocable arguments"
      );

      // TODO: This is overly conservative. We recursively leak all the inputs
      // to this operation whether or not they can possible be part of the
      // result value or not.
      for (let i = 0, n = val.args.length; i < n; i++) {
        this.visitValue(val.args[i]);
      }
      return;
    }
    // If we know which object this might be, then leak each of them.
    for (let element of val.values.getElements()) {
      this.visitValue(element);
    }
  }

  visitValue(val: Value): void {
    if (val instanceof AbstractValue) {
      if (this.mustVisit(val)) this.visitAbstractValue(val);
    } else if (val.isIntrinsic()) {
      // All intrinsic values exist from the beginning of time (except arrays with widened properties)...
      // ...except for a few that come into existance as templates for abstract objects.
      if (val instanceof ArrayValue && ArrayValue.isIntrinsicAndHasWidenedNumericProperty(val)) {
        if (this.mustVisit(val)) this.visitValueObject(val);
      } else {
        this.mustVisit(val);
      }
    } else if (val instanceof EmptyValue) {
      this.mustVisit(val);
    } else if (val instanceof PrimitiveValue) {
      this.mustVisit(val);
    } else if (val instanceof ProxyValue) {
      if (this.mustVisit(val)) this.visitValueProxy(val);
    } else if (val instanceof FunctionValue) {
      invariant(val instanceof FunctionValue);
      if (this.mustVisit(val)) this.visitValueFunction(val);
    } else {
      invariant(val instanceof ObjectValue);
      if (this.mustVisit(val)) this.visitValueObject(val);
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
      // If we're tracking a pure function, we can assume that only newly
      // created objects and bindings, within it, are mutable. Any other
      // object can safely be assumed to be deeply immutable as far as this
      // pure function is concerned. However, any mutable object needs to
      // be tainted as possibly having changed to anything.
      let visitor = new ObjectValueLeakingVisitor(realm, objectsTrackedForLeaks);
      visitor.visitValue(value);
    }
  }
}

export class MaterializeImplementation {
  // TODO: Understand relation to snapshots: #2441
  materializeObject(realm: Realm, val: ObjectValue): void {
    materializeObject(realm, val);
  }

  // This routine materializes objects reachable from non-local bindings read
  // by a function. It does this for the purpose of outlining calls to that function.
  //
  // Notes:
  // - Locations that are only read need not materialize because their values are up-to-date
  // at optimization time,
  // - Locations that are written to are ignored, because we make the assumption, for now,
  // that the function being outlined is pure.
  // - Previously havoced locations (#2446) should be reloaded, but are currently rejected.
  // - Specialization depends on the assumption that the Array op will only be used once.
  // First, we will enforce it: #2448. Later we will relax it: #2454
  materializeObjectsTransitive(realm: Realm, outlinedFunction: FunctionValue): void {
    invariant(realm.isInPureScope());
    let objectsToMaterialize: Set<ObjectValue> = new Set();
    let visitedValues: Set<Value> = new Set();
    computeFromValue(outlinedFunction);

    if (objectsToMaterialize.size !== 0 && realm.instantRender.enabled) {
      let error = new CompilerDiagnostic(
        "Instant Render does not support array operators that reference objects via non-local bindings",
        outlinedFunction.expressionLocation,
        "PP0042",
        "FatalError"
      );
      realm.handleError(error);
      throw new FatalError();
    }

    for (let object of objectsToMaterialize) {
      if (!TestIntegrityLevel(realm, object, "frozen")) materializeObject(realm, object);
    }

    return;
    function computeFromBindings(func: FunctionValue, nonLocalReadBindings: Set<string>): void {
      invariant(func instanceof ECMAScriptSourceFunctionValue);
      let environment = func.$Environment;
      while (environment) {
        let record = environment.environmentRecord;
        if (record instanceof ObjectEnvironmentRecord) computeFromValue(record.object);
        else if (record instanceof DeclarativeEnvironmentRecord || record instanceof FunctionEnvironmentRecord)
          computeFromDeclarativeEnvironmentRecord(record, nonLocalReadBindings);
        else if (record instanceof GlobalEnvironmentRecord) {
          // TODO: #2484
          break;
        }
        environment = environment.parent;
      }
    }
    function computeFromDeclarativeEnvironmentRecord(
      record: DeclarativeEnvironmentRecord,
      nonLocalReadBindings: Set<string>
    ): void {
      let environmentBindings = record.bindings;
      for (let bindingName of Object.keys(environmentBindings)) {
        let binding = environmentBindings[bindingName];
        invariant(binding !== undefined);
        let found = nonLocalReadBindings.delete(bindingName);
        // Check what undefined could mean here, besides absent binding
        // #2446
        if (found && binding.value !== undefined) {
          computeFromValue(binding.value);
        }
      }
    }
    function computeFromAbstractValue(value: AbstractValue): void {
      if (value.values.isTop()) {
        for (let arg of value.args) {
          computeFromValue(arg);
        }
      } else {
        // If we know which object this might be, then leak each of them.
        for (let element of value.values.getElements()) {
          computeFromValue(element);
        }
      }
    }
    function computeFromProxyValue(value: ProxyValue): void {
      computeFromValue(value.$ProxyTarget);
      computeFromValue(value.$ProxyHandler);
    }
    function computeFromValue(value: Value): void {
      if (value.isIntrinsic() || value instanceof EmptyValue || value instanceof PrimitiveValue) {
        visit(value);
      } else if (value instanceof AbstractValue) {
        ifNotVisited(value, computeFromAbstractValue);
      } else if (value instanceof FunctionValue) {
        ifNotVisited(value, computeFromFunctionValue);
      } else if (value instanceof ObjectValue) {
        ifNotVisited(value, computeFromObjectValue);
      } else if (value instanceof ProxyValue) {
        ifNotVisited(value, computeFromProxyValue);
      }
    }
    function computeFromObjectValue(value: Value): void {
      invariant(value instanceof ObjectValue);
      let kind = value.getKind();
      computeFromObjectProperties(value, kind);

      switch (kind) {
        case "RegExp":
        case "Number":
        case "String":
        case "Boolean":
        case "ReactElement":
        case "ArrayBuffer":
        case "Array":
          break;
        case "Date":
          let dateValue = value.$DateValue;
          invariant(dateValue !== undefined);
          computeFromValue(dateValue);
          break;
        case "Float32Array":
        case "Float64Array":
        case "Int8Array":
        case "Int16Array":
        case "Int32Array":
        case "Uint8Array":
        case "Uint16Array":
        case "Uint32Array":
        case "Uint8ClampedArray":
        case "DataView":
          let buf = value.$ViewedArrayBuffer;
          invariant(buf !== undefined);
          computeFromValue(buf);
          break;
        case "Map":
        case "WeakMap":
          ifNotVisited(value, computeFromMap);
          break;
        case "Set":
        case "WeakSet":
          ifNotVisited(value, computeFromSet);
          break;
        default:
          invariant(kind === "Object", `Object of kind ${kind} is not supported in calls to abstract functions.`);
          invariant(
            value.$ParameterMap === undefined,
            `Arguments object is not supported in calls to abstract functions.`
          );
          break;
      }
      if (!objectsToMaterialize.has(value)) objectsToMaterialize.add(value);
    }
    function computeFromDescriptor(descriptor: Descriptor): void {
      invariant(descriptor.value === undefined || descriptor.value instanceof Value);
      if (descriptor.value !== undefined) computeFromValue(descriptor.value);
      if (descriptor.get !== undefined) computeFromValue(descriptor.get);
      if (descriptor.set !== undefined) computeFromValue(descriptor.set);
    }
    function computeFromObjectPropertyBinding(binding: PropertyBinding): void {
      let descriptor = binding.descriptor;
      if (descriptor === undefined) return; //deleted
      computeFromDescriptor(descriptor);
    }

    function computeFromObjectProperties(obj: ObjectValue, kind?: ObjectKind): void {
      // symbol properties
      for (let [, propertyBindingValue] of obj.symbols) {
        invariant(propertyBindingValue);
        computeFromObjectPropertyBinding(propertyBindingValue);
      }

      // string properties
      for (let [, propertyBindingValue] of obj.properties) {
        invariant(propertyBindingValue);
        computeFromObjectPropertyBinding(propertyBindingValue);
      }

      // inject properties with computed names
      if (obj.unknownProperty !== undefined) {
        let desc = obj.unknownProperty.descriptor;
        if (desc !== undefined) {
          let val = desc.value;
          invariant(val instanceof AbstractValue);
          computeFromObjectPropertiesWithComputedNames(val);
        }
      }

      // prototype
      computeFromObjectPrototype(obj);
    }
    function computeFromObjectPrototype(obj: ObjectValue) {
      computeFromValue(obj.$Prototype);
    }
    function computeFromFunctionValue(fn: FunctionValue) {
      computeFromObjectProperties(fn);

      if (fn instanceof BoundFunctionValue) {
        computeFromValue(fn.$BoundTargetFunction);
        computeFromValue(fn.$BoundThis);
        for (let boundArg of fn.$BoundArguments) computeFromValue(boundArg);
        return;
      }

      invariant(
        !(fn instanceof NativeFunctionValue),
        "all native function values should have already been created outside this pure function"
      );

      // TODO: Add items to nonLocalReadBindings in passing
      let nonLocalReadBindings = nonLocalReadBindingsOfFunction(fn);
      computeFromBindings(fn, nonLocalReadBindings);
    }

    function computeFromObjectPropertiesWithComputedNames(absVal: AbstractValue): void {
      // TODO: #2484
      notSupportedForTransitiveMaterialization();
    }

    function computeFromMap(val: ObjectValue): void {
      let kind = val.getKind();

      let entries;
      if (kind === "Map") {
        entries = val.$MapData;
      } else {
        invariant(kind === "WeakMap");
        entries = val.$WeakMapData;
      }
      invariant(entries !== undefined);
      let len = entries.length;

      for (let i = 0; i < len; i++) {
        let entry = entries[i];
        let key = entry.$Key;
        let value = entry.$Value;
        if (key === undefined || value === undefined) continue;
        computeFromValue(key);
        computeFromValue(value);
      }
    }

    function computeFromSet(val: ObjectValue): void {
      let kind = val.getKind();

      let entries;
      if (kind === "Set") {
        entries = val.$SetData;
      } else {
        invariant(kind === "WeakSet");
        entries = val.$WeakSetData;
      }
      invariant(entries !== undefined);
      let len = entries.length;

      for (let i = 0; i < len; i++) {
        let entry = entries[i];
        if (entry === undefined) continue;

        computeFromValue(entry);
      }
    }

    function nonLocalReadBindingsOfFunction(func: FunctionValue) {
      // unboundWrites is currently not used, but we leave it in place
      // to reuse the function closure visitor implemented for leaking
      let functionInfo = {
        unboundReads: new Set(),
        unboundWrites: new Set(),
      };

      invariant(func instanceof ECMAScriptSourceFunctionValue);

      let formalParameters = func.$FormalParameters;
      invariant(formalParameters != null);

      let code = func.$ECMAScriptCode;
      invariant(code != null);

      traverse(
        t.file(t.program([t.expressionStatement(t.functionExpression(null, formalParameters, code))])),
        LeakedClosureRefVisitor,
        null,
        functionInfo
      );
      traverse.cache.clear();

      // TODO #2478: add invariant that there are no write bindings
      return functionInfo.unboundReads;
    }
    function ifNotVisited<T>(value: T, computeFrom: T => void): void {
      if (!visitedValues.has(value)) {
        visitedValues.add(value);
        computeFrom(value);
      }
    }
    function visit(value: Value): void {
      visitedValues.add(value);
    }
    function notSupportedForTransitiveMaterialization() {
      let error = new CompilerDiagnostic(
        "Not supported for transitive materialization",
        outlinedFunction.expressionLocation,
        "PP0041",
        "FatalError"
      );
      realm.handleError(error);
      throw new FatalError();
    }
  }
}
