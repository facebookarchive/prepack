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
  DeclarativeEnvironmentRecord,
  FunctionEnvironmentRecord,
  ObjectEnvironmentRecord,
  GlobalEnvironmentRecord,
} from "../environment.js";
import {
  BoundFunctionValue,
  ProxyValue,
  SymbolValue,
  AbstractValue,
  EmptyValue,
  FunctionValue,
  PrimitiveValue,
  Value,
  ObjectValue,
  NativeFunctionValue,
} from "../values/index.js";
import { IsDataDescriptor, TestIntegrityLevel } from "../methods/index.js";
import type { BabelNodeExpression } from "babel-types";
import invariant from "../invariant.js";

import { ResidualHeapInspector } from "../serializer/ResidualHeapInspector.js";

function emitAllProperties(realm: Realm, O: ObjectValue) {
  invariant(realm.generator, "a generator must exist while tracking a pure function");
  let generator = realm.generator;
  invariant(
    O !== realm.$GlobalObject,
    "we should not be able to get here because the global object is never mutated in a pure function."
  );
  // Temporary hack
  let insp = new ResidualHeapInspector(realm, (null: any));
  for (let [P, propertyBinding] of O.properties) {
    if (insp.canIgnoreProperty(O, P)) {
      continue;
    }
    let desc = propertyBinding.descriptor;
    if (desc === undefined) continue; // deleted
    if (IsDataDescriptor(realm, desc) && desc.configurable && desc.enumerable && desc.writable) {
      let descValue = desc.value || realm.intrinsics.undefined;
      invariant(descValue instanceof Value);
      generator.emitPropertyAssignment(O, P, descValue);
    } else {
      generator.emitDefineProperty(O, P, desc);
    }
  }
  // TODO: Emit symbol properties, prototype and other fields as well.
}

class TaintedValueVisitor {
  realm: Realm;
  // Values to visit if they're reachable.
  impureObjects: Set<ObjectValue>;
  // Values that has been visited.
  visitedValues: Set<Value>;

  constructor(realm: Realm, impureObjects: Set<ObjectValue>) {
    this.realm = realm;
    this.impureObjects = impureObjects;
    this.visitedValues = new Set();
  }

  _mark(val: Value): boolean {
    if (!this.impureObjects.has((val: any))) return false;
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
    // visit properties
    for (let [symbol, propertyBinding] of obj.symbols) {
      invariant(propertyBinding);
      let desc = propertyBinding.descriptor;
      if (desc === undefined) continue; //deleted
      this.visitDescriptor(desc);
      this.visitValue(symbol);
    }

    // visit properties
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

    // if this object wasn't already tainted, we need to emit all properties
    // that had been set until this point, and mark it as tainted so that any
    // mutation and property access get tracked after this.
    if (!obj.isTaintedObject()) {
      emitAllProperties(this.realm, obj);
      obj.makeTainted();
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

  visitDeclarativeEnvironmentRecordBinding(record: DeclarativeEnvironmentRecord) {
    // TODO: Only visit bindings that are actually referenced by the function value.
    let bindings = record.bindings;
    for (let bindingName of Object.keys(bindings)) {
      let binding = bindings[bindingName];
      if (bindingName === "arguments") {
        // The arguments binding is not reachable from another function.
        // This special case will go away once we only taint referenced bindings.
        continue;
      }
      let value = binding.value;
      if (value) {
        this.visitValue(value);
      }
      // TODO: Tainting needs to be reverted if we're tracking effects.
      if (!binding.isTainted) {
        binding.isTainted = true;
        binding.initialValue = value;
      }
      // Delete the value. We will lazily set it to a derived abstract value
      // if someone tries to read it after the abstract function call.
      delete binding.value;
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

    let environment = val.$Environment.parent;
    while (environment) {
      let record = environment.environmentRecord;
      if (record instanceof ObjectEnvironmentRecord) {
        this.visitValue(record.object);
        continue;
      }

      invariant(
        !(record instanceof GlobalEnvironmentRecord),
        "we should never reach the global scope because it is never impure in a pure function."
      );
      invariant(record instanceof DeclarativeEnvironmentRecord);

      this.visitDeclarativeEnvironmentRecordBinding(record);

      if (record instanceof FunctionEnvironmentRecord) {
        // If this is a function environment, we visit the function object which if it is
        // impure will comeback here to visit its parent environment.
        let fn = record.$FunctionObject;
        this.visitValue(fn);
        break;
      }
      environment = environment.parent;
    }
  }

  visitValueObject(val: ObjectValue): void {
    let kind = val.getKind();
    this.visitObjectProperties(val, kind);

    switch (kind) {
      case "RegExp":
      case "Number":
      case "String":
      case "Boolean":
      case "ReactElement":
      case "ArrayBuffer":
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

  visitValueSymbol(val: SymbolValue): void {
    if (val.$Description) this.visitValue(val.$Description);
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
      if (this._mark(val)) this.visitAbstractValue(val);
    } else if (val.isIntrinsic()) {
      // All intrinsic values exist from the beginning of time...
      // ...except for a few that come into existance as templates for abstract objects (TODO #882).
      this._mark(val);
    } else if (val instanceof EmptyValue) {
      this._mark(val);
    } else if (val instanceof PrimitiveValue) {
      this._mark(val);
    } else if (val instanceof ProxyValue) {
      if (this._mark(val)) this.visitValueProxy(val);
    } else if (val instanceof FunctionValue) {
      invariant(val instanceof FunctionValue);
      if (this._mark(val)) this.visitValueFunction(val);
    } else {
      invariant(val instanceof ObjectValue);
      if (val.originalConstructor !== undefined) {
        invariant(val instanceof ObjectValue);
        if (this._mark(val)) this.visitValueObject(val);
      } else {
        if (this._mark(val)) this.visitValueObject(val);
      }
    }
  }
}

function ensureFrozenValue(realm, value, ast) {
  // TODO: This should really check if it is recursively immutability.
  if (value instanceof ObjectValue && !TestIntegrityLevel(realm, value, "frozen")) {
    let diag = new CompilerDiagnostic(
      "Unfrozen object leaked before end of global code",
      ast.loc,
      "PP0017",
      "RecoverableError"
    );
    if (realm.handleError(diag) !== "Recover") throw new FatalError();
  }
}

// Ensure that a value is immutable. If it is not, set all its properties to abstract values
// and all reachable bindings to abstract values.
export function taintImpureValue(realm: Realm, value: Value, ast: BabelNodeExpression) {
  let impureObjects = realm.impureObjects;
  if (impureObjects === undefined) {
    // We're not tracking a pure function. That means that we would track
    // everything as impure. We'll assume that any object argument
    // is invalid unless it's frozen.
    ensureFrozenValue(realm, value, ast);
  } else {
    // If we're tracking a pure function, we can assume that only newly
    // created objects and bindings, within it, are mutable. Any other
    // object can safely be assumed to be deeply immutable as far as this
    // pure function is concerned. However, any mutable object needs to
    // be tainted as possibly having changed to anything.
    let visitor = new TaintedValueVisitor(realm, impureObjects);
    visitor.visitValue(value);
  }
}
