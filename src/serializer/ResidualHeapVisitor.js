/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { GlobalEnvironmentRecord, DeclarativeEnvironmentRecord } from "../environment.js";
import { FatalError } from "../errors.js";
import { Realm } from "../realm.js";
import type { Descriptor } from "../types.js";
import { IsUnresolvableReference, ResolveBinding, IsArray, Get } from "../methods/index.js";
import {
  BoundFunctionValue,
  ProxyValue,
  SymbolValue,
  AbstractValue,
  EmptyValue,
  ECMAScriptSourceFunctionValue,
  FunctionValue,
  Value,
  ObjectValue,
  NativeFunctionValue,
} from "../values/index.js";
import { describeLocation } from "../intrinsics/ecma262/Error.js";
import * as t from "babel-types";
import type { BabelNodeBlockStatement } from "babel-types";
import { Generator } from "../utils/generator.js";
import type { GeneratorEntry, VisitEntryCallbacks } from "../utils/generator.js";
import traverse from "babel-traverse";
import invariant from "../invariant.js";
import type { VisitedBinding, VisitedBindings, FunctionInfo } from "./types.js";
import { ClosureRefVisitor } from "./visitors.js";
import { Logger } from "./logger.js";
import { Modules } from "./modules.js";
import { ResidualHeapInspector } from "./ResidualHeapInspector.js";

export type Scope = FunctionValue | Generator;

/* This class visits all values that are reachable in the residual heap.
   In particular, this "filters out" values that are...
   - captured by a DeclarativeEnvironmentRecord, but not actually used by any closure.
   - Unmodified prototype objects
   TODO #492: Figure out minimal set of values that need to be kept alive for WeakSet and WeakMap instances.
*/
export class ResidualHeapVisitor {
  constructor(realm: Realm, logger: Logger, modules: Modules) {
    invariant(realm.useAbstractInterpretation);
    this.realm = realm;
    this.logger = logger;
    this.modules = modules;

    this.declarativeEnvironmentRecordsBindings = new Map();
    this.globalBindings = new Map();
    this.functionInfos = new Map();
    this.functionBindings = new Map();
    this.values = new Map();
    let generator = this.realm.generator;
    invariant(generator);
    this.scope = this.realmGenerator = generator;
    this.inspector = new ResidualHeapInspector(realm, logger);
    this.referencedDeclaredValues = new Set();
    this.delayedVisitGeneratorEntries = [];
  }

  realm: Realm;
  logger: Logger;
  modules: Modules;

  declarativeEnvironmentRecordsBindings: Map<DeclarativeEnvironmentRecord, VisitedBindings>;
  globalBindings: Map<string, VisitedBinding>;
  functionInfos: Map<BabelNodeBlockStatement, FunctionInfo>;
  functionBindings: Map<FunctionValue, VisitedBindings>;
  scope: Scope;
  realmGenerator: Generator;
  values: Map<Value, Set<Scope>>;
  inspector: ResidualHeapInspector;
  referencedDeclaredValues: Set<AbstractValue>;
  delayedVisitGeneratorEntries: Array<{| generator: Generator, entry: GeneratorEntry |}>;

  _withScope(scope: Scope, f: () => void) {
    let oldScope = this.scope;
    this.scope = scope;
    f();
    this.scope = oldScope;
  }

  visitObjectProperties(obj: ObjectValue): void {
    /*
    for (let symbol of obj.symbols.keys()) {
      // TODO #22: visit symbols
    }
    */

    // visit properties
    for (let [key, propertyBinding] of obj.properties) {
      invariant(propertyBinding);
      let desc = propertyBinding.descriptor;
      if (desc === undefined) continue; //deleted
      if (!this.inspector.canIgnoreProperty(obj, key)) {
        this.visitDescriptor(desc);
      }
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
    if (obj instanceof FunctionValue) this.visitConstructorPrototype(obj);
  }

  visitObjectPrototype(obj: ObjectValue) {
    let proto = obj.$Prototype;

    let kind = obj.getKind();
    if (proto === this.realm.intrinsics[kind + "Prototype"]) return;

    this.visitValue(proto);
  }

  visitConstructorPrototype(func: FunctionValue) {
    // If the original prototype object was mutated,
    // request its serialization here as this might be observable by
    // residual code.
    let prototype = ResidualHeapInspector.getPropertyValue(func, "prototype");
    if (
      prototype instanceof ObjectValue &&
      prototype.originalConstructor === func &&
      !this.inspector.isDefaultPrototype(prototype)
    ) {
      this.visitValue(prototype);
    }
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
    if (desc.value !== undefined) this.visitValue(desc.value);
    if (desc.get !== undefined) this.visitValue(desc.get);
    if (desc.set !== undefined) this.visitValue(desc.set);
  }

  visitDeclarativeEnvironmentRecordBinding(r: DeclarativeEnvironmentRecord, n: string): VisitedBinding {
    let visitedBindings = this.declarativeEnvironmentRecordsBindings.get(r);
    if (!visitedBindings) {
      visitedBindings = Object.create(null);
      this.declarativeEnvironmentRecordsBindings.set(r, visitedBindings);
    }
    let visitedBinding: ?VisitedBinding = visitedBindings[n];
    if (!visitedBinding) {
      let realm = this.realm;
      let binding = r.bindings[n];
      invariant(!binding.deletable);
      let value = (binding.initialized && binding.value) || realm.intrinsics.undefined;
      visitedBinding = { value, modified: false, declarativeEnvironmentRecord: r };
      visitedBindings[n] = visitedBinding;
    }
    invariant(visitedBinding.value !== undefined);
    this.visitValue(visitedBinding.value);
    return visitedBinding;
  }

  visitValueIntrinsic(val: Value): void {}

  visitValueArray(val: ObjectValue): void {
    this.visitObjectProperties(val);
    let lenProperty = Get(this.realm, val, "length");
    if (lenProperty instanceof AbstractValue) this.visitValue(lenProperty);
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

    if (val instanceof NativeFunctionValue) {
      return;
    }

    invariant(val instanceof ECMAScriptSourceFunctionValue);
    invariant(val.constructor === ECMAScriptSourceFunctionValue);
    let formalParameters = val.$FormalParameters;
    invariant(formalParameters != null);
    let code = val.$ECMAScriptCode;
    invariant(code != null);

    let functionInfo = this.functionInfos.get(code);

    if (!functionInfo) {
      functionInfo = {
        names: Object.create(null),
        modified: Object.create(null),
        usesArguments: false,
        usesThis: false,
      };
      this.functionInfos.set(code, functionInfo);

      let state = {
        tryQuery: this.logger.tryQuery.bind(this.logger),
        val,
        functionInfo,
        map: functionInfo.names,
        realm: this.realm,
      };

      traverse(
        t.file(t.program([t.expressionStatement(t.functionExpression(null, formalParameters, code))])),
        ClosureRefVisitor,
        null,
        state
      );

      if (val.isResidual && Object.keys(functionInfo.names).length) {
        if (!val.isUnsafeResidual) {
          this.logger.logError(
            val,
            `residual function ${describeLocation(this.realm, val, undefined, code.loc) ||
              "(unknown)"} refers to the following identifiers defined outside of the local scope: ${Object.keys(
              functionInfo.names
            ).join(", ")}`
          );
        }
      }
    }

    let visitedBindings = Object.create(null);
    this._withScope(val, () => {
      invariant(functionInfo);
      for (let innerName in functionInfo.names) {
        let visitedBinding;
        let doesNotMatter = true;
        let reference = this.logger.tryQuery(
          () => ResolveBinding(this.realm, innerName, doesNotMatter, val.$Environment),
          undefined,
          true
        );
        if (reference === undefined) {
          visitedBinding = this.visitGlobalBinding(innerName);
        } else {
          invariant(!IsUnresolvableReference(this.realm, reference));
          let referencedBase = reference.base;
          let referencedName: string = (reference.referencedName: any);
          if (typeof referencedName !== "string") {
            throw new FatalError("TODO: do not know how to visit reference with symbol");
          }
          if (reference.base instanceof GlobalEnvironmentRecord) {
            visitedBinding = this.visitGlobalBinding(referencedName);
          } else if (referencedBase instanceof DeclarativeEnvironmentRecord) {
            visitedBinding = this.visitDeclarativeEnvironmentRecordBinding(referencedBase, referencedName);
          } else {
            invariant(false);
          }
        }
        visitedBindings[innerName] = visitedBinding;
        if (functionInfo.modified[innerName]) visitedBinding.modified = true;
      }
    });

    this.functionBindings.set(val, visitedBindings);
  }

  visitValueObject(val: ObjectValue): void {
    this.visitObjectProperties(val);

    // If this object is a prototype object that was implicitly created by the runtime
    // for a constructor, then we can obtain a reference to this object
    // in a special way that's handled alongside function serialization.
    let constructor = val.originalConstructor;
    if (constructor !== undefined) {
      this.visitValue(constructor);
      return;
    }

    let kind = val.getKind();
    switch (kind) {
      case "RegExp":
      case "Number":
      case "String":
      case "Boolean":
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
        if (kind !== "Object") this.logger.logError(val, `Object of kind ${kind} is not supported in residual heap.`);
        if (this.$ParameterMap !== undefined)
          this.logger.logError(val, `Arguments object is not supported in residual heap.`);
        return;
    }
  }

  visitValueSymbol(val: SymbolValue): void {}

  visitValueProxy(val: ProxyValue): void {
    this.visitValue(val.$ProxyTarget);
    this.visitValue(val.$ProxyHandler);
  }

  visitAbstractValue(val: AbstractValue): void {
    if (val.kind === "sentinel member expression")
      this.logger.logError(val, "expressions of type o[p] are not yet supported for partially known o and unknown p");
    //this.referencedDeclaredValues.add(val);
    for (let abstractArg of val.args) this.visitValue(abstractArg);
  }

  _mark(val: Value): boolean {
    let scopes = this.values.get(val);
    if (scopes === undefined) this.values.set(val, (scopes = new Set()));
    if (scopes.has(this.scope)) return false;
    scopes.add(this.scope);
    return true;
  }

  visitValue(val: Value): void {
    if (val instanceof AbstractValue) {
      if (this._mark(val)) this.visitAbstractValue(val);
    } else if (val.isIntrinsic()) {
      // For scoping reasons, we fall back to the main body for intrinsics.
      this._withScope(this.realmGenerator, () => {
        if (this._mark(val)) this.visitValueIntrinsic(val);
      });
    } else if (val instanceof EmptyValue) {
      this._mark(val);
    } else if (ResidualHeapInspector.isLeaf(val)) {
      this._mark(val);
    } else if (IsArray(this.realm, val)) {
      invariant(val instanceof ObjectValue);
      if (this._mark(val)) this.visitValueArray(val);
    } else if (val instanceof ProxyValue) {
      if (this._mark(val)) this.visitValueProxy(val);
    } else if (val instanceof FunctionValue) {
      // Function declarations should get hoisted in the global code so that instances only get allocated once
      this._withScope(this.realmGenerator, () => {
        invariant(val instanceof FunctionValue);
        if (this._mark(val)) this.visitValueFunction(val);
      });
    } else if (val instanceof SymbolValue) {
      if (this._mark(val)) this.visitValueSymbol(val);
    } else if (val instanceof ObjectValue) {
      // Prototypes are reachable via function declarations, and those get hoisted, so we need to move
      // prototype initialization to the global code as well.
      if (val.originalConstructor !== undefined) {
        this._withScope(this.realmGenerator, () => {
          invariant(val instanceof ObjectValue);
          if (this._mark(val)) this.visitValueObject(val);
        });
      } else {
        if (this._mark(val)) this.visitValueObject(val);
      }
    } else {
      invariant(false);
    }
  }

  visitGlobalBinding(key: string): VisitedBinding {
    let binding = this.globalBindings.get(key);
    if (!binding) {
      let value = this.realm.getGlobalLetBinding(key);
      binding = ({ value, modified: true }: VisitedBinding);
      this.globalBindings.set(key, binding);
    }
    if (binding.value) this.visitValue(binding.value);
    return binding;
  }

  createGeneratorVisitCallbacks(generator: Generator): VisitEntryCallbacks {
    return {
      visitValue: this.visitValue.bind(this),
      visitGenerator: this.visitGenerator.bind(this),
      canSkip: (value: AbstractValue): boolean => {
        return !this.referencedDeclaredValues.has(value) && !this.values.has(value);
      },
      recordDeclaration: (value: AbstractValue) => {
        this.referencedDeclaredValues.add(value);
      },
      recordDelayedEntry: (entry: GeneratorEntry) => {
        this.delayedVisitGeneratorEntries.push({ generator, entry });
      },
    };
  }

  visitGenerator(generator: Generator): void {
    this._withScope(generator, () => {
      generator.visit(this.createGeneratorVisitCallbacks(generator));
    });
  }

  visitRoots(): void {
    this.visitGenerator(this.realmGenerator);
    for (let [, moduleValue] of this.modules.initializedModules) this.visitValue(moduleValue);
    // Do a fixpoint over all pure generator entries to make sure that we visit
    // arguments of only BodyEntries that are required by some other residual value
    let oldDelayedEntries = [];
    while (oldDelayedEntries.length !== this.delayedVisitGeneratorEntries.length) {
      oldDelayedEntries = this.delayedVisitGeneratorEntries;
      this.delayedVisitGeneratorEntries = [];
      for (let { generator, entry } of oldDelayedEntries)
        generator.visitEntry(entry, this.createGeneratorVisitCallbacks(generator));
    }
  }
}
