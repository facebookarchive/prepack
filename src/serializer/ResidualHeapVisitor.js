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
import type { Effects } from "../realm.js";
import type { Descriptor, PropertyBinding } from "../types.js";
import { IsUnresolvableReference, ToLength, ResolveBinding, IsArray, Get } from "../methods/index.js";
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
  AbstractObjectValue,
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
import { getSuggestedArrayLiteralLength } from "./utils.js";

export type Scope = FunctionValue | Generator;

/* This class visits all values that are reachable in the residual heap.
   In particular, this "filters out" values that are...
   - captured by a DeclarativeEnvironmentRecord, but not actually used by any closure.
   - Unmodified prototype objects
   TODO #680: Figure out minimal set of values that need to be kept alive for WeakSet and WeakMap instances.
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
    this.scope = this.baseContext = generator;
    this.inspector = new ResidualHeapInspector(realm, logger);
    this.referencedDeclaredValues = new Set();
    this.delayedVisitGeneratorEntries = [];
  }

  realm: Realm;
  logger: Logger;
  modules: Modules;

  declarativeEnvironmentRecordsBindings: Map<DeclarativeEnvironmentRecord, VisitedBindings>;
  // Either realmGenerator or the FunctionValue of an additional function to serialize
  globalBindings: Map<string, VisitedBinding>;
  functionInfos: Map<BabelNodeBlockStatement, FunctionInfo>;
  functionBindings: Map<FunctionValue, VisitedBindings>;
  scope: Scope;
  baseContext: Scope;
  values: Map<Value, Set<Scope>>;
  inspector: ResidualHeapInspector;
  referencedDeclaredValues: Set<AbstractValue>;
  delayedVisitGeneratorEntries: Array<{| baseContext: Scope, generator: Generator, entry: GeneratorEntry |}>;

  _withScope(scope: Scope, f: () => void) {
    let oldScope = this.scope;
    this.scope = scope;
    f();
    this.scope = oldScope;
  }

  visitObjectProperty(binding: PropertyBinding) {
    let desc = binding.descriptor;
    if (desc === undefined) return; //deleted
    let obj = binding.object;
    if (obj instanceof AbstractObjectValue || !this.inspector.canIgnoreProperty(obj, binding.key)) {
      this.visitDescriptor(desc);
    }
  }

  visitObjectProperties(obj: ObjectValue): void {
    // visit properties
    for (let [symbol, propertyBinding] of obj.symbols) {
      invariant(propertyBinding);
      let desc = propertyBinding.descriptor;
      if (desc === undefined) continue; //deleted
      this.visitDescriptor(desc);
      this.visitValue(symbol);
    }

    // visit properties
    for (let [, propertyBinding] of obj.properties) {
      invariant(propertyBinding);
      this.visitObjectProperty(propertyBinding);
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

  visitValueArray(val: ObjectValue): void {
    this.visitObjectProperties(val);
    const realm = this.realm;
    let lenProperty = Get(realm, val, "length");
    if (
      lenProperty instanceof AbstractValue ||
      ToLength(realm, lenProperty) !== getSuggestedArrayLiteralLength(realm, val)
    ) {
      this.visitValue(lenProperty);
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

    invariant(!(val instanceof NativeFunctionValue), "all native function values should be intrinsics");

    invariant(val instanceof ECMAScriptSourceFunctionValue);
    invariant(val.constructor === ECMAScriptSourceFunctionValue);
    let formalParameters = val.$FormalParameters;
    invariant(formalParameters != null);
    let code = val.$ECMAScriptCode;
    invariant(code != null);

    let functionInfo = this.functionInfos.get(code);

    if (!functionInfo) {
      functionInfo = {
        unbound: Object.create(null),
        modified: Object.create(null),
        usesArguments: false,
        usesThis: false,
      };
      this.functionInfos.set(code, functionInfo);

      let state = {
        tryQuery: this.logger.tryQuery.bind(this.logger),
        val,
        functionInfo,
        realm: this.realm,
      };

      traverse(
        t.file(t.program([t.expressionStatement(t.functionExpression(null, formalParameters, code))])),
        ClosureRefVisitor,
        null,
        state
      );

      if (val.isResidual && Object.keys(functionInfo.unbound).length) {
        if (!val.isUnsafeResidual) {
          this.logger.logError(
            val,
            `residual function ${describeLocation(this.realm, val, undefined, code.loc) ||
              "(unknown)"} refers to the following identifiers defined outside of the local scope: ${Object.keys(
              functionInfo.unbound
            ).join(", ")}`
          );
        }
      }
    }

    let visitedBindings = Object.create(null);
    this._withScope(val, () => {
      invariant(functionInfo);
      for (let innerName in functionInfo.unbound) {
        let visitedBinding;
        let doesNotMatter = true;
        let reference = this.logger.tryQuery(
          () => ResolveBinding(this.realm, innerName, doesNotMatter, val.$Environment),
          undefined,
          false /* The only reason `ResolveBinding` might fail is because the global object is partial. But in that case, we know that we are dealing with the global scope. */
        );
        if (
          reference === undefined ||
          IsUnresolvableReference(this.realm, reference) ||
          reference.base instanceof GlobalEnvironmentRecord
        ) {
          visitedBinding = this.visitGlobalBinding(innerName);
        } else {
          invariant(!IsUnresolvableReference(this.realm, reference));
          let referencedBase = reference.base;
          let referencedName: string = (reference.referencedName: any);
          if (typeof referencedName !== "string") {
            throw new FatalError("TODO: do not know how to visit reference with symbol");
          }
          invariant(referencedBase instanceof DeclarativeEnvironmentRecord);
          visitedBinding = this.visitDeclarativeEnvironmentRecordBinding(referencedBase, referencedName);
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

  visitValueSymbol(val: SymbolValue): void {
    if (val.$Description) this.visitValue(val.$Description);
  }

  visitValueProxy(val: ProxyValue): void {
    this.visitValue(val.$ProxyTarget);
    this.visitValue(val.$ProxyHandler);
  }

  visitAbstractValue(val: AbstractValue): void {
    if (val.kind === "sentinel member expression")
      this.logger.logError(val, "expressions of type o[p] are not yet supported for partially known o and unknown p");
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
      // All intrinsic values exist from the beginning of time...
      // ...except for a few that come into existance as templates for abstract objects (TODO #882).
      this._withScope(this.baseContext, () => {
        this._mark(val);
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
      this._withScope(this.baseContext, () => {
        invariant(val instanceof FunctionValue);
        if (this._mark(val)) this.visitValueFunction(val);
      });
    } else if (val instanceof SymbolValue) {
      if (this._mark(val)) this.visitValueSymbol(val);
    } else {
      invariant(val instanceof ObjectValue);

      // Prototypes are reachable via function declarations, and those get hoisted, so we need to move
      // prototype initialization to the global code as well.
      if (val.originalConstructor !== undefined) {
        this._withScope(this.baseContext, () => {
          invariant(val instanceof ObjectValue);
          if (this._mark(val)) this.visitValueObject(val);
        });
      } else {
        if (this._mark(val)) this.visitValueObject(val);
      }
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

  createGeneratorVisitCallbacks(generator: Generator, baseContext: Scope): VisitEntryCallbacks {
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
        this.delayedVisitGeneratorEntries.push({ baseContext, generator, entry });
      },
    };
  }

  visitGenerator(generator: Generator, afterGeneratorVisit?: () => void): void {
    this._withScope(generator, () => {
      generator.visit(this.createGeneratorVisitCallbacks(generator, this.baseContext));
      if (afterGeneratorVisit) afterGeneratorVisit();
    });
  }

  visitRoots(additionalFunctionValuesAndEffects: Map<FunctionValue, Effects>): void {
    let generator = this.realm.generator;
    invariant(generator);
    this.visitGenerator(generator);
    for (let [, moduleValue] of this.modules.initializedModules) this.visitValue(moduleValue);
    this.realm.evaluateAndRevertInGlobalEnv(() => {
      if (additionalFunctionValuesAndEffects.size) {
        for (let [functionValue, effects] of additionalFunctionValuesAndEffects.entries()) {
          let [r, g, ob, pb: Map<PropertyBinding, void | Descriptor>, co] = effects;
          // Need to copy these because applying them is a destructive operation
          let ob_copy = new Map(ob);
          let pb_copy = new Map(pb);
          // result -- ignore TODO: return the result from the function somehow
          // Generator -- visit all entries
          // Bindings -- only need to serialize bindings if they're captured by some nested function ??
          //          -- need to apply them and maybe need to revisit functions in ancestors to make sure
          //          -- we don't overwrite anything they capture
          //          -- TODO: deal with these properly
          // PropertyBindings -- visit any property bindings that aren't to createdobjects
          // CreatedObjects -- should take care of itself
          this.realm.applyEffects([r, new Generator(this.realm), ob_copy, pb_copy, co]);
          // Allows us to emit function declarations etc. inside of this additional
          // function instead of adding them at global scope
          this.baseContext = functionValue;
          let visitProperties = () => {
            for (let propertyBinding of pb.keys()) {
              let binding: PropertyBinding = ((propertyBinding: any): PropertyBinding);
              if (co.has(binding.object)) continue; // Created Object's binding
              if (binding.descriptor === undefined) continue; //deleted
              this.visitObjectProperty(binding);
            }
          };
          this.visitGenerator(g, visitProperties);
        }
      }
      // Do a fixpoint over all pure generator entries to make sure that we visit
      // arguments of only BodyEntries that are required by some other residual value
      let oldDelayedEntries = [];
      while (oldDelayedEntries.length !== this.delayedVisitGeneratorEntries.length) {
        oldDelayedEntries = this.delayedVisitGeneratorEntries;
        this.delayedVisitGeneratorEntries = [];
        for (let { baseContext, generator: entryGenerator, entry } of oldDelayedEntries) {
          this.baseContext = baseContext;
          this._withScope(entryGenerator, () => {
            entryGenerator.visitEntry(entry, this.createGeneratorVisitCallbacks(entryGenerator, baseContext));
          });
        }
      }
    });
  }
}
