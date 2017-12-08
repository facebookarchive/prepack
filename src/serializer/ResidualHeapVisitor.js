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
import type { Descriptor, PropertyBinding, ObjectKind } from "../types.js";
import { HashSet, IsArray, Get } from "../methods/index.js";
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
import type {
  ResidualFunctionBinding,
  FunctionInfo,
  AdditionalFunctionInfo,
  FunctionInstance,
  AdditionalFunctionEffects,
} from "./types.js";
import { ClosureRefVisitor } from "./visitors.js";
import { Logger } from "./logger.js";
import { Modules } from "./modules.js";
import { ResidualHeapInspector } from "./ResidualHeapInspector.js";
import { getSuggestedArrayLiteralLength } from "./utils.js";
import { Environment, To } from "../singletons.js";

export type Scope = FunctionValue | Generator;

/* This class visits all values that are reachable in the residual heap.
   In particular, this "filters out" values that are...
   - captured by a DeclarativeEnvironmentRecord, but not actually used by any closure.
   - Unmodified prototype objects
   TODO #680: Figure out minimal set of values that need to be kept alive for WeakSet and WeakMap instances.
*/
export class ResidualHeapVisitor {
  constructor(
    realm: Realm,
    logger: Logger,
    modules: Modules,
    additionalFunctionValuesAndEffects: Map<FunctionValue, AdditionalFunctionEffects>
  ) {
    invariant(realm.useAbstractInterpretation);
    this.realm = realm;
    this.logger = logger;
    this.modules = modules;

    this.declarativeEnvironmentRecordsBindings = new Map();
    this.globalBindings = new Map();
    this.functionInfos = new Map();
    this.functionInstances = new Map();
    this.values = new Map();
    let generator = this.realm.generator;
    invariant(generator);
    this.scope = this.commonScope = generator;
    this.inspector = new ResidualHeapInspector(realm, logger);
    this.referencedDeclaredValues = new Set();
    this.delayedVisitGeneratorEntries = [];
    this.additionalFunctionValuesAndEffects = additionalFunctionValuesAndEffects;
    this.equivalenceSet = new HashSet();
    this.additionalFunctionValueInfos = new Map();
  }

  realm: Realm;
  logger: Logger;
  modules: Modules;

  // Caches that ensure one ResidualFunctionBinding exists per (record, name) pair
  declarativeEnvironmentRecordsBindings: Map<DeclarativeEnvironmentRecord, Map<string, ResidualFunctionBinding>>;
  globalBindings: Map<string, ResidualFunctionBinding>;

  functionInfos: Map<BabelNodeBlockStatement, FunctionInfo>;
  scope: Scope;
  // Either the realm's generator or the FunctionValue of an additional function to serialize
  commonScope: Scope;
  values: Map<Value, Set<Scope>>;
  inspector: ResidualHeapInspector;
  referencedDeclaredValues: Set<AbstractValue>;
  delayedVisitGeneratorEntries: Array<{| commonScope: Scope, generator: Generator, entry: GeneratorEntry |}>;
  additionalFunctionValuesAndEffects: Map<FunctionValue, AdditionalFunctionEffects>;
  functionInstances: Map<FunctionValue, FunctionInstance>;
  additionalFunctionValueInfos: Map<FunctionValue, AdditionalFunctionInfo>;
  equivalenceSet: HashSet<AbstractValue>;

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

  visitObjectProperties(obj: ObjectValue, kind?: ObjectKind): void {
    // visit properties
    if (kind !== "ReactElement") {
      for (let [symbol, propertyBinding] of obj.symbols) {
        invariant(propertyBinding);
        let desc = propertyBinding.descriptor;
        if (desc === undefined) continue; //deleted
        this.visitDescriptor(desc);
        this.visitValue(symbol);
      }
    }

    // visit properties
    for (let [propertyBindingKey, propertyBindingValue] of obj.properties) {
      // we don't want to the $$typeof or _owner properties
      // as this is contained within the JSXElement, otherwise
      // they we be need to be emitted during serialization
      if (kind === "ReactElement" && (propertyBindingKey === "$$typeof" || propertyBindingKey === "_owner")) {
        continue;
      }
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
    if (kind !== "ReactElement") {
      // we don't want to the ReactElement prototype visited
      // as this is contained within the JSXElement, otherwise
      // they we be need to be emitted during serialization
      this.visitObjectPrototype(obj);
    }
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
      absVal.args[0] = this.visitEquivalentValue(cond);
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
    if (desc.joinCondition !== undefined) {
      desc.joinCondition = this.visitEquivalentValue(desc.joinCondition);
      if (desc.descriptor1 !== undefined) this.visitDescriptor(desc.descriptor1);
      if (desc.descriptor2 !== undefined) this.visitDescriptor(desc.descriptor2);
      return;
    }
    if (desc.value !== undefined) desc.value = this.visitEquivalentValue(desc.value);
    if (desc.get !== undefined) this.visitValue(desc.get);
    if (desc.set !== undefined) this.visitValue(desc.set);
  }

  visitDeclarativeEnvironmentRecordBinding(r: DeclarativeEnvironmentRecord, n: string): ResidualFunctionBinding {
    let residualFunctionBindings = this.declarativeEnvironmentRecordsBindings.get(r);
    if (!residualFunctionBindings) {
      residualFunctionBindings = new Map();
      this.declarativeEnvironmentRecordsBindings.set(r, residualFunctionBindings);
    }
    let residualFunctionBinding = residualFunctionBindings.get(n);
    if (!residualFunctionBinding) {
      let realm = this.realm;
      let binding = r.bindings[n];
      invariant(!binding.deletable);
      let value = (binding.initialized && binding.value) || realm.intrinsics.undefined;
      residualFunctionBinding = { value, modified: false, declarativeEnvironmentRecord: r };
      residualFunctionBindings.set(n, residualFunctionBinding);
    }
    invariant(residualFunctionBinding.value !== undefined);
    residualFunctionBinding.value = this.visitEquivalentValue(residualFunctionBinding.value);
    return residualFunctionBinding;
  }

  visitValueArray(val: ObjectValue): void {
    this.visitObjectProperties(val);
    const realm = this.realm;
    let lenProperty = Get(realm, val, "length");
    if (
      lenProperty instanceof AbstractValue ||
      To.ToLength(realm, lenProperty) !== getSuggestedArrayLiteralLength(realm, val)
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
        unbound: new Set(),
        modified: new Set(),
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

      if (val.isResidual && functionInfo.unbound.size) {
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

    let residualFunctionBindings = new Map();
    this._withScope(val, () => {
      invariant(functionInfo);
      for (let innerName of functionInfo.unbound) {
        let residualFunctionBinding;
        let doesNotMatter = true;
        let reference = this.logger.tryQuery(
          () => Environment.ResolveBinding(this.realm, innerName, doesNotMatter, val.$Environment),
          undefined,
          false /* The only reason `ResolveBinding` might fail is because the global object is partial. But in that case, we know that we are dealing with the common scope. */
        );
        if (
          reference === undefined ||
          Environment.IsUnresolvableReference(this.realm, reference) ||
          reference.base instanceof GlobalEnvironmentRecord
        ) {
          residualFunctionBinding = this.visitGlobalBinding(innerName);
        } else {
          invariant(!Environment.IsUnresolvableReference(this.realm, reference));
          let referencedBase = reference.base;
          let referencedName: string = (reference.referencedName: any);
          if (typeof referencedName !== "string") {
            throw new FatalError("TODO: do not know how to visit reference with symbol");
          }
          invariant(referencedBase instanceof DeclarativeEnvironmentRecord);
          residualFunctionBinding = this.visitDeclarativeEnvironmentRecordBinding(referencedBase, referencedName);
        }
        residualFunctionBindings.set(innerName, residualFunctionBinding);
        if (functionInfo.modified.has(innerName)) residualFunctionBinding.modified = true;
      }
    });

    this.functionInstances.set(val, {
      residualFunctionBindings,
      initializationStatements: [],
      functionValue: val,
      scopeInstances: new Set(),
    });
  }

  visitValueObject(val: ObjectValue): void {
    let kind = val.getKind();
    this.visitObjectProperties(val, kind);

    // If this object is a prototype object that was implicitly created by the runtime
    // for a constructor, then we can obtain a reference to this object
    // in a special way that's handled alongside function serialization.
    let constructor = val.originalConstructor;
    if (constructor !== undefined) {
      this.visitValue(constructor);
      return;
    }

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
    for (let i = 0, n = val.args.length; i < n; i++) {
      val.args[i] = this.visitEquivalentValue(val.args[i]);
    }
  }

  _mark(val: Value): boolean {
    let scopes = this.values.get(val);
    if (scopes === undefined) this.values.set(val, (scopes = new Set()));
    if (scopes.has(this.scope)) return false;
    scopes.add(this.scope);
    return true;
  }

  visitEquivalentValue<T: Value>(val: T): T {
    if (val instanceof AbstractValue) {
      let equivalentValue = this.equivalenceSet.add(val);
      if (this._mark(equivalentValue)) this.visitAbstractValue(equivalentValue);
      return (equivalentValue: any);
    }
    this.visitValue(val);
    return val;
  }

  visitValue(val: Value): void {
    invariant(!val.refuseSerialization);
    if (val instanceof AbstractValue) {
      if (this._mark(val)) this.visitAbstractValue(val);
    } else if (val.isIntrinsic()) {
      // All intrinsic values exist from the beginning of time...
      // ...except for a few that come into existance as templates for abstract objects (TODO #882).
      if (val.isTemplate) this._mark(val);
      else
        this._withScope(this.commonScope, () => {
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
      // Function declarations should get hoisted in common scope so that instances only get allocated once
      this._withScope(this.commonScope, () => {
        invariant(val instanceof FunctionValue);
        if (this._mark(val)) this.visitValueFunction(val);
      });
    } else if (val instanceof SymbolValue) {
      if (this._mark(val)) this.visitValueSymbol(val);
    } else {
      invariant(val instanceof ObjectValue);

      // Prototypes are reachable via function declarations, and those get hoisted, so we need to move
      // prototype initialization to the common scope code as well.
      if (val.originalConstructor !== undefined) {
        this._withScope(this.commonScope, () => {
          invariant(val instanceof ObjectValue);
          if (this._mark(val)) this.visitValueObject(val);
        });
      } else {
        if (this._mark(val)) this.visitValueObject(val);
      }
    }
  }

  visitGlobalBinding(key: string): ResidualFunctionBinding {
    let binding = this.globalBindings.get(key);
    if (!binding) {
      let value = this.realm.getGlobalLetBinding(key);
      binding = ({ value, modified: true, declarativeEnvironmentRecord: null }: ResidualFunctionBinding);
      this.globalBindings.set(key, binding);
    }
    if (binding.value) binding.value = this.visitEquivalentValue(binding.value);
    return binding;
  }

  createGeneratorVisitCallbacks(generator: Generator, commonScope: Scope): VisitEntryCallbacks {
    return {
      visitValues: (values: Array<Value>) => {
        for (let i = 0, n = values.length; i < n; i++) values[i] = this.visitEquivalentValue(values[i]);
      },
      visitGenerator: this.visitGenerator.bind(this),
      canSkip: (value: AbstractValue): boolean => {
        return !this.referencedDeclaredValues.has(value) && !this.values.has(value);
      },
      recordDeclaration: (value: AbstractValue) => {
        this.referencedDeclaredValues.add(value);
      },
      recordDelayedEntry: (entry: GeneratorEntry) => {
        this.delayedVisitGeneratorEntries.push({ commonScope, generator, entry });
      },
    };
  }

  visitGenerator(generator: Generator): void {
    this._withScope(generator, () => {
      generator.visit(this.createGeneratorVisitCallbacks(generator, this.commonScope));
    });
  }

  visitAdditionalFunctionEffects() {
    for (let [functionValue, { effects }] of this.additionalFunctionValuesAndEffects.entries()) {
      let [
        result,
        generator,
        modifiedBindings,
        modifiedProperties: Map<PropertyBinding, void | Descriptor>,
        createdObjects,
      ] = effects;
      // Need to do this fixup because otherwise we will skip over this function's
      // generator in the _getTarget scope lookup
      generator.parent = functionValue.parent;
      functionValue.parent = generator;
      // result -- ignore TODO: return the result from the function somehow
      // Generator -- visit all entries
      // Bindings -- (modifications to named variables) only need to serialize bindings if they're
      //             captured by a residual function
      //          -- need to apply them and maybe need to revisit functions in ancestors to make sure
      //             we don't overwrite anything they capture
      //          -- TODO: deal with these properly
      // PropertyBindings -- (property modifications) visit any property bindings to pre-existing objects
      // CreatedObjects -- should take care of itself
      this.realm.applyEffects([
        result,
        new Generator(this.realm),
        modifiedBindings,
        modifiedProperties,
        createdObjects,
      ]);
      // Allows us to emit function declarations etc. inside of this additional
      // function instead of adding them at global scope
      this.commonScope = functionValue;
      let modifiedBindingInfo = new Map();
      let visitPropertiesAndBindings = () => {
        for (let propertyBinding of modifiedProperties.keys()) {
          let binding: PropertyBinding = ((propertyBinding: any): PropertyBinding);
          let object = binding.object;
          if (object instanceof ObjectValue && createdObjects.has(object)) continue; // Created Object's binding
          if (object.refuseSerialization) continue; // modification to internal state
          if (object.intrinsicName === "global") continue; // Avoid double-counting
          this.visitObjectProperty(binding);
        }
        // Handing of ModifiedBindings
        for (let additionalBinding of modifiedBindings.keys()) {
          //let modifiedBinding: Binding = ((additionalBinding: any): Binding);
          let modifiedBinding = additionalBinding;
          let residualBinding;
          if (modifiedBinding.isGlobal) {
            residualBinding = this.globalBindings.get(modifiedBinding.name);
          } else {
            let containingEnv = modifiedBinding.environment;
            invariant(containingEnv instanceof DeclarativeEnvironmentRecord);
            let bindMap = this.declarativeEnvironmentRecordsBindings.get(containingEnv);
            if (bindMap) residualBinding = bindMap.get(modifiedBinding.name);
          }
          // Only visit it if there is already a binding (no binding means that
          // the additional function created the binding)
          if (residualBinding && modifiedBinding.value !== residualBinding.value) {
            let newValue = modifiedBinding.value;
            invariant(newValue);
            this.visitValue(newValue);
            residualBinding.modified = true;
            // This should be enforced by checkThatFunctionsAreIndependent
            invariant(
              !residualBinding.additionalFunctionOverridesValue,
              "We should only have one additional function value modifying any given residual binding"
            );
            residualBinding.additionalFunctionOverridesValue = true;
            modifiedBindingInfo.set(modifiedBinding, residualBinding);
          }
        }
        invariant(result instanceof Value);
        this.visitValue(result);
      };
      invariant(functionValue instanceof ECMAScriptSourceFunctionValue);
      let code = functionValue.$ECMAScriptCode;
      invariant(code != null);
      let functionInfo = this.functionInfos.get(code);
      invariant(functionInfo);
      let funcInstance = this.functionInstances.get(functionValue);
      invariant(funcInstance);
      this.additionalFunctionValueInfos.set(functionValue, {
        functionValue,
        captures: functionInfo.unbound,
        modifiedBindings: modifiedBindingInfo,
        instance: funcInstance,
      });
      this.visitGenerator(generator);
      this._withScope(generator, visitPropertiesAndBindings);
      this.realm.restoreBindings(modifiedBindings);
      this.realm.restoreProperties(modifiedProperties);
    }
    // Do a fixpoint over all pure generator entries to make sure that we visit
    // arguments of only BodyEntries that are required by some other residual value
    let oldDelayedEntries = [];
    while (oldDelayedEntries.length !== this.delayedVisitGeneratorEntries.length) {
      oldDelayedEntries = this.delayedVisitGeneratorEntries;
      this.delayedVisitGeneratorEntries = [];
      for (let { commonScope, generator: entryGenerator, entry } of oldDelayedEntries) {
        this.commonScope = commonScope;
        this._withScope(entryGenerator, () => {
          entryGenerator.visitEntry(entry, this.createGeneratorVisitCallbacks(entryGenerator, commonScope));
        });
      }
    }
    return this.realm.intrinsics.undefined;
  }

  visitRoots(): void {
    let generator = this.realm.generator;
    invariant(generator);
    this.visitGenerator(generator);
    for (let moduleValue of this.modules.initializedModules.values()) this.visitValue(moduleValue);
    this.realm.evaluateAndRevertInGlobalEnv(this.visitAdditionalFunctionEffects.bind(this));
  }
}
