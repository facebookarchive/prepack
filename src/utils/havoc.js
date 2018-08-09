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

type HavocedFunctionInfo = {
  unboundReads: Set<string>,
  unboundWrites: Set<string>,
};

type OperationType = "HAVOC" | "LEAK_ONLY";

function visitName(
  path: BabelTraversePath,
  state: HavocedFunctionInfo,
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

let HavocedClosureRefVisitor = {
  ReferencedIdentifier(path: BabelTraversePath, state: HavocedFunctionInfo): void {
    if (ignorePath(path)) return;

    let innerName = path.node.name;
    if (innerName === "arguments") {
      return;
    }
    visitName(path, state, innerName, true, false);
  },

  "AssignmentExpression|UpdateExpression"(path: BabelTraversePath, state: HavocedFunctionInfo): void {
    let doesRead = path.node.operator !== "=";
    for (let name in path.getBindingIdentifiers()) {
      visitName(path, state, name, doesRead, true);
    }
  },
};

function getHavocedFunctionInfo(value: FunctionValue) {
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
    HavocedClosureRefVisitor,
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
class ObjectValueVisitor {
  realm: Realm;
  // ObjectValues to visit if they're reachable.
  objectsTrackedForLeaks: Set<ObjectValue>;
  // Values that has been visited.
  visitedValues: Set<Value>;
  operation: OperationType;
  _heapInspector: HeapInspector;

  constructor(realm: Realm, objectsTrackedForLeaks: Set<ObjectValue>, operation: OperationType) {
    this.realm = realm;
    this.objectsTrackedForLeaks = objectsTrackedForLeaks;
    this.visitedValues = new Set();
    this.operation = operation;
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
      if (desc !== undefined) {
        let val = desc.value;
        invariant(val instanceof AbstractValue);
        this.visitObjectPropertiesWithComputedNames(val);
      }
    }

    // prototype
    this.visitObjectPrototype(obj);

    if (TestIntegrityLevel(this.realm, obj, "frozen")) return;

    let shouldMaterialize = false;
    // if this object wasn't already havoced, we need mark it as havoced
    // so that any mutation and property access get tracked after this.
    if (this.operation === "HAVOC" && obj.mightNotBeHavocedObject()) {
      shouldMaterialize = true;
      obj.havoc();
    } else if (this.operation === "LEAK_ONLY" && obj.mightNotBeLeakedObject()) {
      shouldMaterialize = true;
      obj.leak();
    }

    if (shouldMaterialize) {
      // materialization is a common operation and needs to be invoked
      // whenever non-final values need to be made available at intermediate
      // points in a program's control flow. An object can be materialized by
      // calling materializeObject(). Sometimes, objects
      // are materialized in cohorts (such as during leaking and havocing).
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

  visitDescriptor(desc: Descriptor): void {
    invariant(desc.value === undefined || desc.value instanceof Value);
    if (desc.value !== undefined) this.visitValue(desc.value);
    if (desc.get !== undefined) this.visitValue(desc.get);
    if (desc.set !== undefined) this.visitValue(desc.set);
  }

  visitDeclarativeEnvironmentRecordBinding(
    record: DeclarativeEnvironmentRecord,
    remainingHavocedBindings: HavocedFunctionInfo
  ): void {
    let bindings = record.bindings;
    for (let bindingName of Object.keys(bindings)) {
      let binding = bindings[bindingName];
      // Check if this binding is referenced, and if so delete it from the set.
      let isRead = remainingHavocedBindings.unboundReads.delete(bindingName);
      let isWritten = remainingHavocedBindings.unboundWrites.delete(bindingName);
      if (isRead) {
        // If this binding can be read from the closure, its value has now havoced.
        let value = binding.value;
        if (value) {
          this.visitValue(value);
        }
      }
      if (isWritten || isRead) {
        // If this binding could have been mutated from the closure, then the
        // binding itself has now leaked, but not necessarily the value in it.
        if (this.operation === "HAVOC") {
          leakBinding(binding, "NO_READ_WRITE");
        } else if (this.operation === "LEAK_ONLY") {
          leakBinding(binding, "READ_ONLY");
        }
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

    let remainingHavocedBindings = getHavocedFunctionInfo(val);

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
      this.visitDeclarativeEnvironmentRecordBinding(record, remainingHavocedBindings);

      if (record instanceof FunctionEnvironmentRecord) {
        // If this is a function environment, which is not tracked for havocs,
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
      // Only objects need to be havoced.
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

      // TODO: This is overly conservative. We recursively havoc all the inputs
      // to this operation whether or not they can possible be part of the
      // result value or not.
      for (let i = 0, n = val.args.length; i < n; i++) {
        this.visitValue(val.args[i]);
      }
      return;
    }
    // If we know which objects this might be, then havoc each of them.
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

function havocOrLeakValue(realm: Realm, value: Value, operation: OperationType, loc: ?BabelNodeSourceLocation): void {
  if (realm.instantRender.enabled) {
    // TODO: For InstantRender...
    // - For declarative bindings, we do want proper materialization/leaking/havocing
    // - For object properties, we conceptually want materialization
    //   (however, not via statements that mutate the objects,
    //   but only as part of the initial object literals),
    //   but actual no leaking or havocing as there should be a way to annotate/enforce
    //   that external/abstract functions are pure with regards to heap objects
    return;
  }
  let objectsTrackedForLeaks = realm.createdObjectsTrackedForLeaks;
  if (objectsTrackedForLeaks === undefined) {
    // We're not tracking a pure function. That means that we would track
    // everything as havoced. We'll assume that any object argument
    // is invalid unless it's frozen.
    ensureFrozenValue(realm, value, loc);
  } else {
    // If we're tracking a pure function, we can assume that only newly
    // created objects and bindings, within it, are mutable. Any other
    // object can safely be assumed to be deeply immutable as far as this
    // pure function is concerned. However, any mutable object needs to
    // be tainted as possibly having changed to anything.
    let visitor = new ObjectValueVisitor(realm, objectsTrackedForLeaks, operation);
    visitor.visitValue(value);
  }
}

// Ensure that a value is immutable. If it is not, set all its properties to abstract values
// and all reachable bindings to abstract values.
export class HavocImplementation {
  value(realm: Realm, value: Value, loc: ?BabelNodeSourceLocation): void {
    havocOrLeakValue(realm, value, "HAVOC", loc);
  }
}

export class MaterializeImplementation {
  materialize(realm: Realm, val: ObjectValue) {
    materializeObject(realm, val);
  }
}

export class LeakImplementation {
  value(realm: Realm, value: Value, loc: ?BabelNodeSourceLocation): void {
    havocOrLeakValue(realm, value, "LEAK_ONLY", loc);
  }
}
