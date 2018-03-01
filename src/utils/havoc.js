/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { CompilerDiagnostic, FatalError } from "../errors.js";
import type { Realm } from "../realm.js";
import type { Descriptor, PropertyBinding, ObjectKind } from "../types.js";
import {
  havocBinding,
  DeclarativeEnvironmentRecord,
  FunctionEnvironmentRecord,
  ObjectEnvironmentRecord,
  GlobalEnvironmentRecord,
} from "../environment.js";
import {
  BoundFunctionValue,
  ProxyValue,
  AbstractValue,
  EmptyValue,
  FunctionValue,
  PrimitiveValue,
  Value,
  ObjectValue,
  NativeFunctionValue,
  ECMAScriptSourceFunctionValue,
} from "../values/index.js";
import { TestIntegrityLevel } from "../methods/index.js";
import * as t from "babel-types";
import traverse from "babel-traverse";
import type { BabelTraversePath } from "babel-traverse";
import type { BabelNodeSourceLocation } from "babel-types";
import invariant from "../invariant.js";

type HavocedFunctionInfo = {
  unboundReads: Set<string>,
  unboundWrites: Set<string>,
};

function visitName(path: BabelTraversePath, state: HavocedFunctionInfo, name: string, read: boolean, write: boolean) {
  // Is the name bound to some local identifier? If so, we don't need to do anything
  if (path.scope.hasBinding(name, /*noGlobals*/ true)) return;

  // Otherwise, let's record that there's an unbound identifier
  if (read) state.unboundReads.add(name);
  if (write) state.unboundWrites.add(name);
}

function ignorePath(path: BabelTraversePath) {
  let parent = path.parent;
  return t.isLabeledStatement(parent) || t.isBreakStatement(parent) || t.isContinueStatement(parent);
}

let HavocedClosureRefVisitor = {
  ReferencedIdentifier(path: BabelTraversePath, state: HavocedFunctionInfo) {
    if (ignorePath(path)) return;

    let innerName = path.node.name;
    if (innerName === "arguments") {
      return;
    }
    visitName(path, state, innerName, true, false);
  },

  "AssignmentExpression|UpdateExpression"(path: BabelTraversePath, state: HavocedFunctionInfo) {
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
  return functionInfo;
}

class ObjectValueHavocingVisitor {
  // ObjectValues to visit if they're reachable.
  objectsTrackedForHavoc: Set<ObjectValue>;
  // Values that has been visited.
  visitedValues: Set<Value>;

  constructor(objectsTrackedForHavoc: Set<ObjectValue>) {
    this.objectsTrackedForHavoc = objectsTrackedForHavoc;
    this.visitedValues = new Set();
  }

  mustVisit(val: Value): boolean {
    if (val instanceof ObjectValue) {
      // For Objects we only need to visit it if it is tracked
      // as a newly created object that might still be mutated.
      // Abstract values gets their arguments visited.
      if (!this.objectsTrackedForHavoc.has(val)) return false;
    }
    if (this.visitedValues.has(val)) return false;
    this.visitedValues.add(val);
    return true;
  }

  visitObjectProperty(binding: PropertyBinding) {
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

    if (TestIntegrityLevel(obj.$Realm, obj, "frozen")) return;

    // if this object wasn't already havoced, we need mark it as havoced
    // so that any mutation and property access get tracked after this.
    if (!obj.isHavocedObject()) {
      obj.havoc();
    }
  }

  visitObjectPrototype(obj: ObjectValue) {
    let proto = obj.$Prototype;
    this.visitValue(proto);
  }

  visitObjectPropertiesWithComputedNames(absVal: AbstractValue): void {
    invariant(absVal.args.length === 3);
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
      invariant(consequent instanceof AbstractValue);
      let alternate = absVal.args[2];
      invariant(alternate instanceof AbstractValue);
      this.visitObjectPropertiesWithComputedNames(consequent);
      this.visitObjectPropertiesWithComputedNames(alternate);
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
  ) {
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
        // TODO: We could tag a leaked binding as read and/or write. That way
        // we don't have to havoc values written to this binding if only the binding
        // has been written to. We also don't have to havoc reads from this binding
        // if it is only read from.
        havocBinding(binding);
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
    if (val.isHavocedObject()) {
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

    let environment = val.$Environment.parent;
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
        if (!this.objectsTrackedForHavoc.has(fn)) {
          break;
        }
      }
      environment = environment.parent;
    }
  }

  visitValueObject(val: ObjectValue): void {
    if (val.isHavocedObject()) {
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
        invariant(
          this.$ParameterMap === undefined,
          `Arguments object is not supported in calls to abstract functions.`
        );
        return;
    }
  }

  visitValueProxy(val: ProxyValue): void {
    this.visitValue(val.$ProxyTarget);
    this.visitValue(val.$ProxyHandler);
  }

  visitAbstractValue(val: AbstractValue): void {
    for (let i = 0, n = val.args.length; i < n; i++) {
      this.visitValue(val.args[i]);
    }
  }

  visitValue(val: Value): void {
    if (val instanceof AbstractValue) {
      if (this.mustVisit(val)) this.visitAbstractValue(val);
    } else if (val.isIntrinsic()) {
      // All intrinsic values exist from the beginning of time...
      // ...except for a few that come into existance as templates for abstract objects.
      this.mustVisit(val);
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
      if (val.originalConstructor !== undefined) {
        invariant(val instanceof ObjectValue);
        if (this.mustVisit(val)) this.visitValueObject(val);
      } else {
        if (this.mustVisit(val)) this.visitValueObject(val);
      }
    }
  }
}

function ensureFrozenValue(realm, value, loc) {
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
export class HavocImplementation {
  value(realm: Realm, value: Value, loc: ?BabelNodeSourceLocation) {
    let objectsTrackedForHavoc = realm.createdObjectsTrackedForLeaks;
    if (objectsTrackedForHavoc === undefined) {
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
      let visitor = new ObjectValueHavocingVisitor(objectsTrackedForHavoc);
      visitor.visitValue(value);
    }
  }
}
