/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { GlobalEnvironmentRecord, DeclarativeEnvironmentRecord, EnvironmentRecord } from "../environment.js";
import { CompilerDiagnostic, FatalError } from "../errors.js";
import { type Effects, Realm } from "../realm.js";
import { Path } from "../singletons.js";
import type { Descriptor, PropertyBinding, ObjectKind } from "../types.js";
import type { Binding } from "../environment.js";
import { HashSet, IsArray, Get } from "../methods/index.js";
import {
  AbstractObjectValue,
  AbstractValue,
  ArrayValue,
  BoundFunctionValue,
  ECMAScriptFunctionValue,
  ECMAScriptSourceFunctionValue,
  EmptyValue,
  FunctionValue,
  NativeFunctionValue,
  ObjectValue,
  ProxyValue,
  StringValue,
  SymbolValue,
  Value,
} from "../values/index.js";
import { describeLocation } from "../intrinsics/ecma262/Error.js";
import * as t from "@babel/types";
import type { BabelNodeBlockStatement } from "@babel/types";
import { Generator } from "../utils/generator.js";
import type { GeneratorEntry, VisitEntryCallbacks } from "../utils/generator.js";
import traverse from "@babel/traverse";
import invariant from "../invariant.js";
import type {
  AdditionalFunctionEffects,
  AdditionalFunctionInfo,
  ClassMethodInstance,
  FunctionInfo,
  FunctionInstance,
  ResidualFunctionBinding,
  ReferentializationScope,
  Scope,
  ResidualHeapInfo,
} from "./types.js";
import { ClosureRefVisitor } from "./visitors.js";
import { Logger } from "../utils/logger.js";
import { Modules } from "../utils/modules.js";
import { HeapInspector } from "../utils/HeapInspector.js";
import {
  canIgnoreClassLengthProperty,
  ClassPropertiesToIgnore,
  getObjectPrototypeMetadata,
  getOrDefault,
  getSuggestedArrayLiteralLength,
  withDescriptorValue,
} from "./utils.js";
import { createPathConditions, Environment, To } from "../singletons.js";
import { isReactElement, isReactPropsObject, valueIsReactLibraryObject } from "../react/utils.js";
import { ResidualReactElementVisitor } from "./ResidualReactElementVisitor.js";
import { GeneratorTree } from "./GeneratorTree.js";
import { PropertyDescriptor, AbstractJoinedDescriptor } from "../descriptors.js";

type BindingState = {|
  capturedBindings: Set<ResidualFunctionBinding>,
  capturingScopes: Set<Scope>,
|};

/* This class visits all values that are reachable in the residual heap.
   In particular, this "filters out" values that are:
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
    this.classMethodInstances = new Map();
    this.functionInstances = new Map();
    this.values = new Map();
    this.conditionalFeasibility = new Map();
    let generator = this.realm.generator;
    invariant(generator);
    this.scope = this.globalGenerator = generator;
    this.inspector = new HeapInspector(realm, logger);
    this.referencedDeclaredValues = new Map();
    this.delayedActions = [];
    this.additionalFunctionValuesAndEffects = additionalFunctionValuesAndEffects;
    this.equivalenceSet = new HashSet();
    this.additionalFunctionValueInfos = new Map();
    this.functionToCapturedScopes = new Map();
    let environment = realm.$GlobalEnv.environmentRecord;
    invariant(environment instanceof GlobalEnvironmentRecord);
    this.globalEnvironmentRecord = environment;
    this.additionalGeneratorRoots = new Map();
    this.residualReactElementVisitor = new ResidualReactElementVisitor(this.realm, this);
    this.generatorTree = new GeneratorTree();
  }

  realm: Realm;
  logger: Logger;
  modules: Modules;
  globalGenerator: Generator;

  // Caches that ensure one ResidualFunctionBinding exists per (record, name) pair
  declarativeEnvironmentRecordsBindings: Map<DeclarativeEnvironmentRecord, Map<string, ResidualFunctionBinding>>;
  globalBindings: Map<string, ResidualFunctionBinding>;

  functionToCapturedScopes: Map<ReferentializationScope, Map<DeclarativeEnvironmentRecord, BindingState>>;
  functionInfos: Map<BabelNodeBlockStatement, FunctionInfo>;
  scope: Scope;
  values: Map<Value, Set<Scope>>;

  // For every abstract value of kind "conditional", this map keeps track of whether the consequent and/or alternate is feasible in any scope
  conditionalFeasibility: Map<AbstractValue, { t: boolean, f: boolean }>;
  inspector: HeapInspector;
  referencedDeclaredValues: Map<Value, void | FunctionValue>;
  delayedActions: Array<{| scope: Scope, action: () => void | boolean |}>;
  additionalFunctionValuesAndEffects: Map<FunctionValue, AdditionalFunctionEffects>;
  functionInstances: Map<FunctionValue, FunctionInstance>;
  additionalFunctionValueInfos: Map<FunctionValue, AdditionalFunctionInfo>;
  equivalenceSet: HashSet<AbstractValue>;
  classMethodInstances: Map<FunctionValue, ClassMethodInstance>;
  // Parents will always be a generator, optimized function value or "GLOBAL"
  additionalGeneratorRoots: Map<Generator, Set<ObjectValue>>;
  generatorTree: GeneratorTree;
  globalEnvironmentRecord: GlobalEnvironmentRecord;
  residualReactElementVisitor: ResidualReactElementVisitor;

  // Going backwards from the current scope, find either the containing
  // additional function, or if there isn't one, return the global generator.
  _getCommonScope(): FunctionValue | Generator {
    let s = this.scope;
    while (true) {
      if (s instanceof Generator) s = this.generatorTree.getParent(s);
      else if (s instanceof FunctionValue) {
        // Did we find an additional function?
        if (this.additionalFunctionValuesAndEffects.has(s)) return s;

        // Did the function itself get created by a generator we can chase?
        s = this.generatorTree.getCreator(s) || "GLOBAL";
      } else {
        invariant(s === "GLOBAL");
        let generator = this.globalGenerator;
        invariant(generator);
        return generator;
      }
    }
    invariant(false);
  }

  // If the current scope has a containing additional function, retrieve it.
  _getAdditionalFunctionOfScope(): FunctionValue | void {
    let s = this._getCommonScope();
    return s instanceof FunctionValue ? s : undefined;
  }

  // When a value has been created by some generator that is unrelated
  // to the current common scope, visit the value in the scope it was
  // created --- this causes the value later to be serialized in its
  // creation scope, ensuring that the value has the right creation / life time.
  _registerAdditionalRoot(value: ObjectValue): void {
    let creationGenerator = this.generatorTree.getCreator(value) || this.globalGenerator;

    let additionalFunction = this._getAdditionalFunctionOfScope() || "GLOBAL";
    let targetAdditionalFunction;
    if (creationGenerator === this.globalGenerator) {
      targetAdditionalFunction = "GLOBAL";
    } else {
      let s = creationGenerator;
      while (s instanceof Generator) {
        s = this.generatorTree.getParent(s);
        invariant(s !== undefined);
      }
      invariant(s === "GLOBAL" || s instanceof FunctionValue);
      targetAdditionalFunction = s;
    }

    let usageScope;
    if (additionalFunction === targetAdditionalFunction) {
      usageScope = this.scope;
    } else {
      // Object was created outside of current additional function scope
      invariant(additionalFunction instanceof FunctionValue);
      let additionalFVEffects = this.additionalFunctionValuesAndEffects.get(additionalFunction);
      invariant(additionalFVEffects !== undefined);
      additionalFVEffects.additionalRoots.add(value);

      this._visitInUnrelatedScope(creationGenerator, value);
      usageScope = this.generatorTree.getCreator(value) || this.globalGenerator;
    }

    usageScope = this.scope;
    if (usageScope instanceof Generator) {
      // Also check if object is used in some nested generator scope that involved
      // applying effects; if so, store additional information that the serializer
      // can use to proactive serialize such objects from within the right generator
      let anyRelevantEffects = false;
      for (let g = usageScope; g instanceof Generator; g = this.generatorTree.getParent(g)) {
        if (g === creationGenerator) {
          if (anyRelevantEffects) {
            let s = this.additionalGeneratorRoots.get(g);
            if (s === undefined) this.additionalGeneratorRoots.set(g, (s = new Set()));
            if (!s.has(value)) {
              s.add(value);
              this._visitInUnrelatedScope(g, value);
            }
          }
          break;
        }
        let effectsToApply = g.effectsToApply;
        if (effectsToApply)
          for (let pb of effectsToApply.modifiedProperties.keys())
            if (pb.object === value) {
              anyRelevantEffects = true;
              break;
            }
      }
    }
  }

  // Careful!
  // Only use _withScope when you know that the currently applied effects makes sense for the given (nested) scope!
  _withScope(scope: Scope, f: () => void): void {
    let oldScope = this.scope;
    this.scope = scope;
    try {
      f();
    } finally {
      this.scope = oldScope;
    }
  }

  // Queues up an action to be later processed in some arbitrary scope.
  _enqueueWithUnrelatedScope(scope: Scope, action: () => void | boolean): void {
    // If we are in a zone with a non-default equivalence set (we are wrapped in a `withCleanEquivalenceSet` call) then
    // we need to save our equivalence set so that we may load it before running our action.
    if (this.residualReactElementVisitor.defaultEquivalenceSet === false) {
      const save = this.residualReactElementVisitor.saveEquivalenceSet();
      const originalAction = action;
      action = () => this.residualReactElementVisitor.loadEquivalenceSet(save, originalAction);
    }

    this.delayedActions.push({ scope, action });
  }

  // Queues up visiting a value in some arbitrary scope.
  _visitInUnrelatedScope(scope: Scope, val: Value): void {
    let scopes = this.values.get(val);
    if (scopes !== undefined && scopes.has(scope)) return;
    this._enqueueWithUnrelatedScope(scope, () => this.visitValue(val));
  }

  visitObjectProperty(binding: PropertyBinding): void {
    let desc = binding.descriptor;
    let obj = binding.object;
    invariant(binding.key !== undefined, "Undefined keys should never make it here.");
    if (
      obj instanceof AbstractObjectValue ||
      !(typeof binding.key === "string" && this.inspector.canIgnoreProperty(obj, binding.key))
    ) {
      if (desc !== undefined) this.visitDescriptor(desc);
    }
    if (binding.key instanceof Value) this.visitValue(binding.key);
  }

  visitObjectProperties(obj: ObjectValue, kind?: ObjectKind): void {
    // In non-instant render mode, properties of leaked objects are generated via assignments
    let { skipPrototype, constructor } = getObjectPrototypeMetadata(this.realm, obj);
    if (obj.temporalAlias !== undefined) return;

    // visit properties
    for (let [symbol, propertyBinding] of obj.symbols) {
      invariant(propertyBinding);
      let desc = propertyBinding.descriptor;
      if (desc === undefined) continue; //deleted
      this.visitDescriptor(desc);
      this.visitValue(symbol);
    }

    // visit properties
    for (let [propertyBindingKey, propertyBindingValue] of obj.properties) {
      // we don't want to visit these as we handle the serialization ourselves
      // via a different logic route for classes
      let descriptor = propertyBindingValue.descriptor;
      if (
        obj instanceof ECMAScriptFunctionValue &&
        obj.$FunctionKind === "classConstructor" &&
        (ClassPropertiesToIgnore.has(propertyBindingKey) ||
          (propertyBindingKey === "length" && canIgnoreClassLengthProperty(obj, descriptor, this.logger)))
      ) {
        continue;
      }
      if (propertyBindingValue.pathNode !== undefined) continue; // property is written to inside a loop

      // Leaked object. Properties are set via assignments
      // TODO #2259: Make deduplication in the face of leaking work for custom accessors
      if (
        !(obj instanceof ArrayValue) &&
        !obj.mightNotBeLeakedObject() &&
        (descriptor instanceof PropertyDescriptor && (descriptor.get === undefined && descriptor.set === undefined))
      ) {
        continue;
      }

      this.visitObjectProperty(propertyBindingValue);
    }

    // inject properties with computed names
    if (obj.unknownProperty !== undefined) {
      this.visitObjectPropertiesWithComputedNamesDescriptor(obj.unknownProperty.descriptor);
    }

    // prototype
    if (!skipPrototype) {
      this.visitObjectPrototype(obj);
    }
    if (obj instanceof FunctionValue) {
      this.visitConstructorPrototype(constructor ? constructor : obj);
    } else if (obj instanceof ObjectValue && skipPrototype && constructor) {
      this.visitValue(constructor);
    }
  }

  visitObjectPrototype(obj: ObjectValue): void {
    let proto = obj.$Prototype;

    let kind = obj.getKind();
    if (proto === this.realm.intrinsics[kind + "Prototype"]) return;

    if (!obj.$IsClassPrototype || proto !== this.realm.intrinsics.null) {
      this.visitValue(proto);
    }
  }

  visitConstructorPrototype(func: Value): void {
    // If the original prototype object was mutated,
    // request its serialization here as this might be observable by
    // residual code.
    invariant(func instanceof FunctionValue);
    let prototype = HeapInspector.getPropertyValue(func, "prototype");
    if (
      prototype instanceof ObjectValue &&
      prototype.originalConstructor === func &&
      !this.inspector.isDefaultPrototype(prototype)
    ) {
      this.visitValue(prototype);
    }
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
        absVal.args[0] = this.visitEquivalentValue(cond);
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
      if (desc.value !== undefined) desc.value = this.visitEquivalentValue(desc.value);
      if (desc.get !== undefined) this.visitValue(desc.get);
      if (desc.set !== undefined) this.visitValue(desc.set);
    } else if (desc instanceof AbstractJoinedDescriptor) {
      desc.joinCondition = this.visitEquivalentValue(desc.joinCondition);
      if (desc.descriptor1 !== undefined) this.visitDescriptor(desc.descriptor1);
      if (desc.descriptor2 !== undefined) this.visitDescriptor(desc.descriptor2);
    } else {
      invariant(false, "unknown descriptor");
    }
  }

  visitValueArray(val: ObjectValue): void {
    this._registerAdditionalRoot(val);

    this.visitObjectProperties(val);
    const realm = this.realm;
    let lenProperty;
    if (val.mightBeLeakedObject()) {
      lenProperty = this.realm.evaluateWithoutLeakLogic(() => Get(realm, val, "length"));
    } else {
      lenProperty = Get(realm, val, "length");
    }
    let [initialLength, lengthAssignmentNotNeeded] = getSuggestedArrayLiteralLength(realm, val);
    if (lengthAssignmentNotNeeded) return;
    if (
      lenProperty instanceof AbstractValue
        ? lenProperty.kind !== "widened property"
        : To.ToLength(realm, lenProperty) !== initialLength
    ) {
      this.visitValue(lenProperty);
    }
  }

  visitValueMap(val: ObjectValue): void {
    invariant(val.getKind() === "Map");
    let entries = val.$MapData;

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

  visitValueWeakMap(val: ObjectValue): void {
    invariant(val.getKind() === "WeakMap");
    let entries = val.$WeakMapData;

    invariant(entries !== undefined);
    let len = entries.length;

    for (let i = 0; i < len; i++) {
      let entry = entries[i];
      let key = entry.$Key;
      let value = entry.$Value;

      if (key !== undefined && value !== undefined) {
        let fixpoint_rerun = () => {
          let progress;
          if (this.values.has(key)) {
            progress = true;
            this.visitValue(key);
            this.visitValue(value);
          } else {
            progress = false;
            this._enqueueWithUnrelatedScope(this.scope, fixpoint_rerun);
          }
          return progress;
        };
        fixpoint_rerun();
      }
    }
  }

  visitValueSet(val: ObjectValue): void {
    invariant(val.getKind() === "Set");

    let entries = val.$SetData;
    invariant(entries !== undefined);

    let len = entries.length;
    for (let i = 0; i < len; i++) {
      let entry = entries[i];
      if (entry === undefined) continue;
      this.visitValue(entry);
    }
  }

  visitValueWeakSet(val: ObjectValue): void {
    invariant(val.getKind() === "WeakSet");

    let entries = val.$WeakSetData;
    invariant(entries !== undefined);

    let len = entries.length;
    for (let i = 0; i < len; i++) {
      let entry = entries[i];
      if (entry !== undefined) {
        let fixpoint_rerun = () => {
          let progress;
          if (this.values.has(entry)) {
            progress = true;
            this.visitValue(entry);
          } else {
            progress = false;
            this._enqueueWithUnrelatedScope(this.scope, fixpoint_rerun);
          }
          return progress;
        };
        fixpoint_rerun();
      }
    }
  }

  visitValueFunction(val: FunctionValue): void {
    let isClass = false;

    this._registerAdditionalRoot(val);
    if (val instanceof ECMAScriptFunctionValue && val.$FunctionKind === "classConstructor") {
      invariant(val instanceof ECMAScriptSourceFunctionValue);
      let homeObject = val.$HomeObject;
      if (homeObject instanceof ObjectValue && homeObject.$IsClassPrototype) {
        isClass = true;
      }
    }
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
    let code = val.$ECMAScriptCode;

    let functionInfo = this.functionInfos.get(code);
    let residualFunctionBindings = new Map();
    this.functionInstances.set(val, {
      residualFunctionBindings,
      initializationStatements: [],
      functionValue: val,
      scopeInstances: new Map(),
    });

    if (!functionInfo) {
      functionInfo = {
        depth: 0,
        lexicalDepth: 0,
        unbound: new Map(),
        requireCalls: new Map(),
        modified: new Set(),
        usesArguments: false,
        usesThis: false,
      };
      let state = {
        functionInfo,
        realm: this.realm,
        getModuleIdIfNodeIsRequireFunction: this.modules.getGetModuleIdIfNodeIsRequireFunction(formalParameters, [val]),
      };

      traverse(
        t.file(t.program([t.expressionStatement(t.functionExpression(null, formalParameters, code))])),
        ClosureRefVisitor,
        null,
        state
      );
      traverse.cache.clear();
      this.functionInfos.set(code, functionInfo);

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

    let additionalFunctionEffects = this.additionalFunctionValuesAndEffects.get(val);
    if (additionalFunctionEffects) {
      this._visitAdditionalFunction(val, additionalFunctionEffects);
    } else {
      this._enqueueWithUnrelatedScope(val, () => {
        invariant(this.scope === val);
        invariant(functionInfo);
        for (let innerName of functionInfo.unbound.keys()) {
          let environment = this.resolveBinding(val, innerName);
          let residualBinding = this.getBinding(environment, innerName);
          this.visitBinding(val, residualBinding);
          residualFunctionBindings.set(innerName, residualBinding);
          if (functionInfo.modified.has(innerName)) residualBinding.modified = true;
        }
      });
    }
    if (isClass && val.$HomeObject instanceof ObjectValue) {
      this._visitClass(val, val.$HomeObject);
    }
  }

  _visitBindingHelper(residualFunctionBinding: ResidualFunctionBinding) {
    if (residualFunctionBinding.hasLeaked) return;
    let environment = residualFunctionBinding.declarativeEnvironmentRecord;
    invariant(environment !== null);

    if (residualFunctionBinding.value === undefined) {
      // The first time we visit, we need to initialize the value to its equivalent value
      invariant(environment instanceof DeclarativeEnvironmentRecord);
      let binding = environment.bindings[residualFunctionBinding.name];
      invariant(binding !== undefined);
      invariant(!binding.deletable);
      let value = (binding.initialized && binding.value) || this.realm.intrinsics.undefined;
      if (value !== this.realm.intrinsics.__leakedValue) {
        residualFunctionBinding.value = this.visitEquivalentValue(value);
      }
    } else if (residualFunctionBinding.value !== this.realm.intrinsics.__leakedValue) {
      // Subsequently, we just need to visit the value.
      this.visitValue(residualFunctionBinding.value);
    }
  }

  // Addresses the case:
  // let x = [];
  // let y = [];
  // function a() { x.push("hi"); }
  // function b() { y.push("bye"); }
  // function c() { return x.length + y.length; }
  // Here we need to make sure that a and b both initialize x and y because x and y will be in the same
  // captured scope because c captures both x and y.
  visitBinding(scope: Scope, residualFunctionBinding: ResidualFunctionBinding): void {
    let environment = residualFunctionBinding.declarativeEnvironmentRecord;
    if (environment === null) return;
    invariant(this.scope === scope);

    let refScope = this._getAdditionalFunctionOfScope() || "GLOBAL";
    residualFunctionBinding.potentialReferentializationScopes.add(refScope);
    invariant(!(refScope instanceof Generator));
    let funcToScopes = getOrDefault(this.functionToCapturedScopes, refScope, () => new Map());
    let envRec = residualFunctionBinding.declarativeEnvironmentRecord;
    invariant(envRec !== null);
    let bindingState = getOrDefault(funcToScopes, envRec, () => ({
      capturedBindings: new Set(),
      capturingScopes: new Set(),
    }));
    // If the binding is new for this bindingState, have all functions capturing bindings from that scope visit it
    if (!bindingState.capturedBindings.has(residualFunctionBinding)) {
      for (let capturingScope of bindingState.capturingScopes) {
        this._enqueueWithUnrelatedScope(capturingScope, () => this._visitBindingHelper(residualFunctionBinding));
      }
      bindingState.capturedBindings.add(residualFunctionBinding);
    }
    // If the function is new for this bindingState, visit all existent bindings in this scope
    if (!bindingState.capturingScopes.has(scope)) {
      invariant(this.scope === scope);
      for (let residualBinding of bindingState.capturedBindings) this._visitBindingHelper(residualBinding);
      bindingState.capturingScopes.add(scope);
    }
  }

  resolveBinding(val: FunctionValue, name: string): EnvironmentRecord {
    let doesNotMatter = true;
    let reference = this.logger.tryQuery(
      () => Environment.ResolveBinding(this.realm, name, doesNotMatter, val.$Environment),
      undefined
    );
    if (
      reference === undefined ||
      Environment.IsUnresolvableReference(this.realm, reference) ||
      reference.base === this.globalEnvironmentRecord ||
      reference.base === this.globalEnvironmentRecord.$DeclarativeRecord
    ) {
      return this.globalEnvironmentRecord;
    } else {
      invariant(!Environment.IsUnresolvableReference(this.realm, reference));
      let referencedBase = reference.base;
      let referencedName: string = (reference.referencedName: any);
      invariant(referencedName === name);
      invariant(referencedBase instanceof DeclarativeEnvironmentRecord);
      return referencedBase;
    }
  }

  hasBinding(environment: EnvironmentRecord, name: string): boolean {
    if (environment === this.globalEnvironmentRecord.$DeclarativeRecord) environment = this.globalEnvironmentRecord;

    if (environment === this.globalEnvironmentRecord) {
      // Global Binding
      return this.globalBindings.get(name) !== undefined;
    } else {
      invariant(environment instanceof DeclarativeEnvironmentRecord);
      // DeclarativeEnvironmentRecord binding
      let residualFunctionBindings = this.declarativeEnvironmentRecordsBindings.get(environment);
      if (residualFunctionBindings === undefined) return false;
      return residualFunctionBindings.get(name) !== undefined;
    }
  }

  // Visits a binding, returns a ResidualFunctionBinding
  getBinding(environment: EnvironmentRecord, name: string): ResidualFunctionBinding {
    if (environment === this.globalEnvironmentRecord.$DeclarativeRecord) environment = this.globalEnvironmentRecord;

    if (environment === this.globalEnvironmentRecord) {
      // Global Binding
      return getOrDefault(this.globalBindings, name, () => {
        let residualFunctionBinding = {
          name,
          value: undefined,
          modified: true,
          hasLeaked: false,
          declarativeEnvironmentRecord: null,
          potentialReferentializationScopes: new Set(),
        };
        // Queue up visiting of global binding exactly once in the globalGenerator scope.
        this._enqueueWithUnrelatedScope(this.globalGenerator, () => {
          let value = this.realm.getGlobalLetBinding(name);
          if (value !== undefined) residualFunctionBinding.value = this.visitEquivalentValue(value);
        });
        return residualFunctionBinding;
      });
    } else {
      invariant(environment instanceof DeclarativeEnvironmentRecord);
      // DeclarativeEnvironmentRecord binding
      let residualFunctionBindings = getOrDefault(
        this.declarativeEnvironmentRecordsBindings,
        environment,
        () => new Map()
      );
      return getOrDefault(
        residualFunctionBindings,
        name,
        (): ResidualFunctionBinding => {
          invariant(environment instanceof DeclarativeEnvironmentRecord);
          return {
            name,
            value: undefined,
            modified: false,
            hasLeaked: false,
            declarativeEnvironmentRecord: environment,
            potentialReferentializationScopes: new Set(),
          };
        }
      );
      // Note that we don't yet visit the binding (and its value) here,
      // as that should be done by a call to visitBinding, in the right scope,
      // if the binding's incoming value is relevant.
    }
  }

  _visitClass(classFunc: ECMAScriptSourceFunctionValue, classPrototype: ObjectValue): void {
    let visitClassMethod = (propertyNameOrSymbol, methodFunc, methodType, isStatic) => {
      if (methodFunc instanceof ECMAScriptSourceFunctionValue) {
        // if the method does not have a $HomeObject, it's not a class method
        if (methodFunc.$HomeObject !== undefined) {
          if (methodFunc !== classFunc) {
            this._visitClassMethod(methodFunc, methodType, classPrototype, !!isStatic);
          }
        }
      }
    };
    for (let [propertyName, method] of classPrototype.properties) {
      withDescriptorValue(propertyName, method.descriptor, visitClassMethod);
    }
    for (let [symbol, method] of classPrototype.symbols) {
      withDescriptorValue(symbol, method.descriptor, visitClassMethod);
    }

    // handle class inheritance
    if (!(classFunc.$Prototype instanceof NativeFunctionValue)) {
      this.visitValue(classFunc.$Prototype);
    }

    if (classPrototype.properties.has("constructor")) {
      let constructor = classPrototype.properties.get("constructor");

      invariant(constructor !== undefined);
      // check if the constructor was deleted, as it can't really be deleted
      // it just gets set to empty (the default again)
      if (constructor.descriptor === undefined) {
        classFunc.$HasEmptyConstructor = true;
      } else {
        let visitClassProperty = (propertyNameOrSymbol, methodFunc, methodType) => {
          visitClassMethod(propertyNameOrSymbol, methodFunc, methodType, true);
        };
        // check if we have any static methods we need to include
        let constructorFunc = Get(this.realm, classPrototype, "constructor");
        invariant(constructorFunc instanceof ObjectValue);
        for (let [propertyName, method] of constructorFunc.properties) {
          if (
            !ClassPropertiesToIgnore.has(propertyName) &&
            method.descriptor !== undefined &&
            !(
              propertyName === "length" && canIgnoreClassLengthProperty(constructorFunc, method.descriptor, this.logger)
            )
          ) {
            withDescriptorValue(propertyName, method.descriptor, visitClassProperty);
          }
        }
      }
    }
    this.classMethodInstances.set(classFunc, {
      classPrototype,
      methodType: "constructor",
      classSuperNode: undefined,
      classMethodIsStatic: false,
      classMethodKeyNode: undefined,
      classMethodComputed: false,
    });
  }

  _visitClassMethod(
    methodFunc: ECMAScriptSourceFunctionValue,
    methodType: "get" | "set" | "value",
    classPrototype: ObjectValue,
    isStatic: boolean
  ): void {
    this.classMethodInstances.set(methodFunc, {
      classPrototype,
      methodType: methodType === "value" ? "method" : methodType,
      classSuperNode: undefined,
      classMethodIsStatic: isStatic,
      classMethodKeyNode: undefined,
      classMethodComputed: !!methodFunc.$HasComputedName,
    });
  }

  visitValueObject(val: ObjectValue): void {
    invariant(val.isValid());
    this._registerAdditionalRoot(val);
    if (isReactElement(val)) {
      this.residualReactElementVisitor.visitReactElement(val);
      return;
    }
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
        this.visitValueMap(val);
        return;
      case "WeakMap":
        this.visitValueWeakMap(val);
        return;
      case "Set":
        this.visitValueSet(val);
        return;
      case "WeakSet":
        this.visitValueWeakSet(val);
        return;
      default:
        if (kind !== "Object") this.logger.logError(val, `Object of kind ${kind} is not supported in residual heap.`);
        if (this.realm.react.enabled && valueIsReactLibraryObject(this.realm, val, this.logger)) {
          this.realm.fbLibraries.react = val;
        }
        return;
    }
  }

  visitValueSymbol(val: SymbolValue): void {
    if (val.$Description) this.visitValue(val.$Description);
  }

  visitValueProxy(val: ProxyValue): void {
    this._registerAdditionalRoot(val);

    this.visitValue(val.$ProxyTarget);
    this.visitValue(val.$ProxyHandler);
  }

  _visitAbstractValueConditional(val: AbstractValue): void {
    let condition = val.args[0];
    invariant(condition instanceof AbstractValue);

    let cf = this.conditionalFeasibility.get(val);
    if (cf === undefined) this.conditionalFeasibility.set(val, (cf = { t: false, f: false }));

    let feasibleT, feasibleF;
    let savedPath = this.realm.pathConditions;
    try {
      this.realm.pathConditions = this.scope instanceof Generator ? this.scope.pathConditions : createPathConditions();

      let impliesT = Path.implies(condition);
      let impliesF = Path.impliesNot(condition);
      invariant(!(impliesT && impliesF));

      if (!impliesT && !impliesF) {
        feasibleT = feasibleF = true;
      } else {
        feasibleT = impliesT;
        feasibleF = impliesF;
      }
    } finally {
      this.realm.pathConditions = savedPath;
    }

    let visitedT = false,
      visitedF = false;

    if (!cf.t && feasibleT) {
      val.args[1] = this.visitEquivalentValue(val.args[1]);
      cf.t = true;
      if (cf.f) val.args[0] = this.visitEquivalentValue(val.args[0]);
      visitedT = true;
    }

    if (!cf.f && feasibleF) {
      val.args[2] = this.visitEquivalentValue(val.args[2]);
      cf.f = true;
      if (cf.t) val.args[0] = this.visitEquivalentValue(val.args[0]);
      visitedF = true;
    }

    if (!visitedT || !visitedF) {
      let fixpoint_rerun = () => {
        let progress = false;
        invariant(cf !== undefined);
        if (cf.f && cf.t) {
          invariant(!visitedT || !visitedF);
          this.visitValue(val.args[0]);
        }

        if (cf.t && !visitedT) {
          this.visitValue(val.args[1]);
          progress = visitedT = true;
        }
        invariant(cf.t === visitedT);

        if (cf.f && !visitedF) {
          this.visitValue(val.args[2]);
          progress = visitedF = true;
        }
        invariant(cf.f === visitedF);

        // When not all possible outcomes are assumed to be feasible yet after visiting some scopes,
        // it might be that they do become assumed to be feasible when later visiting some other scopes.
        // In that case, we should also re-visit the corresponding cases in this scope.
        // To this end, calling _enqueueWithUnrelatedScope enqueues this function for later re-execution if
        // any other visiting progress was made.
        if (!visitedT || !visitedF) this._enqueueWithUnrelatedScope(this.scope, fixpoint_rerun);

        return progress;
      };

      fixpoint_rerun();
    }
  }

  visitAbstractValue(val: AbstractValue): void {
    invariant(val !== this.realm.intrinsics.__leakedValue, "leaked binding values should never be visited");
    if (val.kind === "sentinel member expression") {
      this.logger.logError(val, "expressions of type o[p] are not yet supported for partially known o and unknown p");
    } else if (val.kind === "environment initialization expression") {
      this.logger.logError(val, "reads during environment initialization should never leak to serialization");
    } else if (val.kind === "conditional") {
      this._visitAbstractValueConditional(val);
      return;
    }
    for (let i = 0, n = val.args.length; i < n; i++) {
      val.args[i] = this.visitEquivalentValue(val.args[i]);
    }
  }

  // Overridable hook for pre-visiting the value.
  // Return false will tell visitor to skip visiting children of this node.
  preProcessValue(val: Value): boolean {
    return this._mark(val);
  }

  // Overridable hook for post-visiting the value.
  postProcessValue(val: Value): void {}

  _mark(val: Value): boolean {
    let scopes = this.values.get(val);
    if (scopes === undefined) this.values.set(val, (scopes = new Set()));
    if (this.scope instanceof Generator && this.scope.effectsToApply === undefined) {
      // If we've already marked this value for any simple parent (non-effect carrying) generator,
      // then we don't need to re-mark it, as such a set of generators is reduced to the
      // parent generator in all uses of the scopes set.
      for (
        let g = this.scope;
        g instanceof Generator && g.effectsToApply === undefined;
        g = this.generatorTree.getParent(g)
      ) {
        if (scopes.has(g)) return false;
      }
    } else if (scopes.has(this.scope)) return false;
    scopes.add(this.scope);
    return true;
  }

  visitEquivalentValue<T: Value>(val: T): T {
    if (val instanceof AbstractValue) {
      let equivalentValue = this.equivalenceSet.add(val);
      if (this.preProcessValue(equivalentValue)) this.visitAbstractValue(equivalentValue);
      this.postProcessValue(equivalentValue);
      return (equivalentValue: any);
    }
    if (val instanceof ObjectValue) {
      invariant(val.isValid());
      if (isReactElement(val)) {
        if (val.temporalAlias !== undefined) {
          return this.visitEquivalentValue(val.temporalAlias);
        }
        let equivalentReactElementValue = this.residualReactElementVisitor.reactElementEquivalenceSet.add(val);
        if (this._mark(equivalentReactElementValue)) this.visitValueObject(equivalentReactElementValue);
        return (equivalentReactElementValue: any);
      } else if (isReactPropsObject(val)) {
        let equivalentReactPropsValue = this.residualReactElementVisitor.reactPropsEquivalenceSet.add(val);
        if (this._mark(equivalentReactPropsValue)) this.visitValueObject(equivalentReactPropsValue);
        return (equivalentReactPropsValue: any);
      }
    }
    this.visitValue(val);
    return val;
  }

  visitValue(val: Value): void {
    invariant(val !== undefined);
    invariant(!(val instanceof ObjectValue && val.refuseSerialization));
    if (val instanceof AbstractValue) {
      if (this.preProcessValue(val)) this.visitAbstractValue(val);
      this.postProcessValue(val);
    } else if (val.isIntrinsic()) {
      // All intrinsic values exist from the beginning of time...
      // ...except for a few that come into existence as templates for abstract objects via executable code.
      if (val instanceof ObjectValue && val.isScopedTemplate) {
        this.preProcessValue(val);
        this.postProcessValue(val);
      } else
        this._enqueueWithUnrelatedScope(this._getCommonScope(), () => {
          this.preProcessValue(val);
          this.postProcessValue(val);
        });
    } else if (val instanceof EmptyValue) {
      this.preProcessValue(val);
      this.postProcessValue(val);
    } else if (HeapInspector.isLeaf(val)) {
      this.preProcessValue(val);
      this.postProcessValue(val);
    } else if (IsArray(this.realm, val)) {
      invariant(val instanceof ObjectValue);
      if (this.preProcessValue(val)) this.visitValueArray(val);
      this.postProcessValue(val);
    } else if (val instanceof ProxyValue) {
      if (this.preProcessValue(val)) this.visitValueProxy(val);
      this.postProcessValue(val);
    } else if (val instanceof FunctionValue) {
      let creationGenerator = this.generatorTree.getCreator(val) || this.globalGenerator;

      // 1. Visit function in its creation scope
      this._enqueueWithUnrelatedScope(creationGenerator, () => {
        invariant(val instanceof FunctionValue);
        if (this.preProcessValue(val)) this.visitValueFunction(val);
        this.postProcessValue(val);
      });

      // 2. If current scope is not related to creation scope,
      //    and if this is not a recursive visit, mark the usage of this function
      //    in the common scope as well.
      let commonScope = this._getCommonScope();
      if (commonScope !== creationGenerator && commonScope !== val) {
        this._enqueueWithUnrelatedScope(commonScope, () => {
          this.preProcessValue(val);
          this.postProcessValue(val);
        });
      }
    } else if (val instanceof SymbolValue) {
      if (this.preProcessValue(val)) this.visitValueSymbol(val);
      this.postProcessValue(val);
    } else {
      invariant(val instanceof ObjectValue);

      if (this.preProcessValue(val)) this.visitValueObject(val);
      this.postProcessValue(val);
    }
  }

  createGeneratorVisitCallbacks(additionalFunctionInfo?: AdditionalFunctionInfo): VisitEntryCallbacks {
    let callbacks = {
      visitEquivalentValue: this.visitEquivalentValue.bind(this),
      visitGenerator: (generator, parent) => {
        invariant(this.generatorTree.getParent(generator) === parent);
        this.visitGenerator(generator, additionalFunctionInfo);
      },
      canOmit: (value: Value): boolean => {
        let canOmit = !this.referencedDeclaredValues.has(value) && !this.values.has(value);
        if (!canOmit) {
          return false;
        }
        if (value instanceof ObjectValue && value.temporalAlias !== undefined) {
          let temporalAlias = value.temporalAlias;
          return !this.referencedDeclaredValues.has(temporalAlias) && !this.values.has(temporalAlias);
        }
        return canOmit;
      },
      recordDeclaration: (value: Value) => {
        this.referencedDeclaredValues.set(value, this._getAdditionalFunctionOfScope());
      },
      recordDelayedEntry: (generator, entry: GeneratorEntry) => {
        this._enqueueWithUnrelatedScope(generator, () => entry.visit(callbacks, generator));
      },
      visitModifiedProperty: (binding: PropertyBinding) => {
        let fixpoint_rerun = () => {
          if (this.values.has(binding.object)) {
            if (binding.internalSlot) {
              invariant(typeof binding.key === "string");
              let error = new CompilerDiagnostic(
                `Internal slot ${binding.key} modified in a nested context. This is not yet supported.`,
                binding.object.expressionLocation,
                "PP1006",
                "FatalError"
              );
              this.realm.handleError(error) === "Fail";
              throw new FatalError();
            }
            this.visitValue(binding.object);
            if (binding.key instanceof Value) this.visitValue(binding.key);
            this.visitObjectProperty(binding);
            return true;
          } else {
            this._enqueueWithUnrelatedScope(this.scope, fixpoint_rerun);
            return false;
          }
        };
        fixpoint_rerun();
      },
      visitModifiedBinding: (modifiedBinding: Binding) => {
        let fixpoint_rerun = () => {
          if (this.hasBinding(modifiedBinding.environment, modifiedBinding.name)) {
            invariant(additionalFunctionInfo);
            let { functionValue } = additionalFunctionInfo;
            invariant(functionValue instanceof ECMAScriptSourceFunctionValue);
            let residualBinding = this.getBinding(modifiedBinding.environment, modifiedBinding.name);
            let funcInstance = additionalFunctionInfo.instance;
            invariant(funcInstance !== undefined);
            funcInstance.residualFunctionBindings.set(modifiedBinding.name, residualBinding);
            let newValue = modifiedBinding.value;
            invariant(newValue);
            this.visitValue(newValue);
            residualBinding.modified = true;
            let otherFunc = residualBinding.additionalFunctionOverridesValue;
            if (otherFunc !== undefined && otherFunc !== functionValue) {
              let otherNameVal = otherFunc._SafeGetDataPropertyValue("name");
              let otherNameStr = otherNameVal instanceof StringValue ? otherNameVal.value : "unknown function";
              let funcNameVal = functionValue._SafeGetDataPropertyValue("name");
              let funNameStr = funcNameVal instanceof StringValue ? funcNameVal.value : "unknown function";
              let error = new CompilerDiagnostic(
                `Variable ${
                  modifiedBinding.name
                } written to in optimized function ${funNameStr} conflicts with write in another optimized function ${otherNameStr}`,
                funcNameVal.expressionLocation,
                "PP1001",
                "RecoverableError"
              );
              if (functionValue.$Realm.handleError(error) === "Fail") throw new FatalError();
            }
            residualBinding.additionalFunctionOverridesValue = functionValue;
            additionalFunctionInfo.modifiedBindings.set(modifiedBinding, residualBinding);
            // TODO #2430 nested optimized functions: revisit adding GLOBAL as outer optimized function
            residualBinding.potentialReferentializationScopes.add("GLOBAL");
            return true;
          } else {
            this._enqueueWithUnrelatedScope(this.scope, fixpoint_rerun);
            return false;
          }
        };
        fixpoint_rerun();
      },
      visitBindingAssignment: (binding: Binding, value: Value) => {
        let residualBinding = this.getBinding(binding.environment, binding.name);
        residualBinding.modified = true;
        residualBinding.hasLeaked = true;
        // This may not have been referentialized if the binding is a local of an optimized function.
        // in that case, we need to figure out which optimized function it is, and referentialize it in that scope.
        let commonScope = this._getCommonScope();
        if (residualBinding.potentialReferentializationScopes.size === 0) {
          this._enqueueWithUnrelatedScope(commonScope, () => {
            if (additionalFunctionInfo !== undefined) {
              let funcInstance = additionalFunctionInfo.instance;
              invariant(funcInstance !== undefined);
              funcInstance.residualFunctionBindings.set(residualBinding.name, residualBinding);
            }
            this.visitBinding(commonScope, residualBinding);
          });
        }
        return this.visitEquivalentValue(value);
      },
    };
    return callbacks;
  }

  visitGenerator(generator: Generator, additionalFunctionInfo?: AdditionalFunctionInfo): void {
    this._withScope(generator, () => {
      generator.visit(this.createGeneratorVisitCallbacks(additionalFunctionInfo));
    });

    // We don't bother purging created objects
  }

  // result -- serialized as a return statement
  // Generator -- visit all entries
  // Bindings -- (modifications to named variables) only need to serialize bindings if they're
  //             captured by a residual function
  //          -- need to apply them and maybe need to revisit functions in ancestors to make sure
  //             we don't overwrite anything they capture
  // PropertyBindings -- (property modifications) visit any property bindings to pre-existing objects
  // CreatedObjects -- should take care of itself
  _visitAdditionalFunction(functionValue: FunctionValue, additionalEffects: AdditionalFunctionEffects): void {
    // Get Instance + Info
    invariant(functionValue instanceof ECMAScriptSourceFunctionValue);
    let code = functionValue.$ECMAScriptCode;
    let functionInfo = this.functionInfos.get(code);
    invariant(functionInfo !== undefined);
    let funcInstance = this.functionInstances.get(functionValue);
    invariant(funcInstance !== undefined);

    // Set Visitor state
    // Allows us to emit function declarations etc. inside of this additional
    // function instead of adding them at global scope
    let visitor = () => {
      invariant(funcInstance !== undefined);
      invariant(functionInfo !== undefined);
      let additionalFunctionInfo = {
        modifiedBindings: new Map(),
        functionValue,
        instance: funcInstance,
        prelude: [],
      };
      this.additionalFunctionValueInfos.set(functionValue, additionalFunctionInfo);

      let effectsGenerator = additionalEffects.generator;
      this.generatorTree.add(functionValue, effectsGenerator);
      this.visitGenerator(effectsGenerator, additionalFunctionInfo);
    };

    if (this.realm.react.enabled) {
      this.residualReactElementVisitor.withCleanEquivalenceSet(visitor);
    } else {
      visitor();
    }
  }

  visitRoots(): void {
    this.generatorTree.add("GLOBAL", this.globalGenerator);
    this.visitGenerator(this.globalGenerator);
    for (let moduleValue of this.modules.initializedModules.values()) this.visitValue(moduleValue);

    this._visitUntilFixpoint();
  }

  _visitUntilFixpoint(): void {
    if (this.realm.react.verbose) {
      this.logger.logInformation(`Computing fixed point...`);
    }
    // Do a fixpoint over all pure generator entries to make sure that we visit
    // arguments of only BodyEntries that are required by some other residual value
    let progress = true;
    while (progress) {
      // Let's partition the actions by their generators,
      // as applying effects is expensive, and so we don't want to do it
      // more often than necessary.
      let actionsByGenerator = new Map();
      let expected = 0;
      for (let { scope, action } of this.delayedActions) {
        let generator;
        if (scope instanceof FunctionValue) generator = this.generatorTree.getCreator(scope) || this.globalGenerator;
        else if (scope === "GLOBAL") generator = this.globalGenerator;
        else {
          invariant(scope instanceof Generator);
          generator = scope;
        }
        let a = actionsByGenerator.get(generator);
        if (a === undefined) actionsByGenerator.set(generator, (a = []));
        a.push({ action, scope });
        expected++;
      }
      this.delayedActions = [];
      progress = false;
      // We build up a tree of effects runner that mirror the nesting of Generator effects.
      // This way, we only have to apply any given effects once, regardless of how many actions we have associated with whatever generators.
      let effectsInfos: Map<Effects, { runner: () => void, nestedEffectsRunners: Array<() => void> }> = new Map();
      let topEffectsRunners: Array<() => void> = [];
      let actual = 0;
      for (let [generator, scopedActions] of actionsByGenerator) {
        let runGeneratorAction = () => {
          for (let { action, scope } of scopedActions) {
            actual++;
            this._withScope(scope, () => {
              if (action() !== false) progress = true;
            });
          }
        };
        let s = generator;
        let visited = new Set();
        let newNestedRunner;
        while (s !== "GLOBAL") {
          invariant(!visited.has(s));
          visited.add(s);
          if (s instanceof Generator) {
            let effectsToApply = s.effectsToApply;
            if (effectsToApply) {
              let info = effectsInfos.get(effectsToApply);
              let runner;
              if (info === undefined) {
                runner = () => {
                  this.realm.withEffectsAppliedInGlobalEnv(() => {
                    invariant(info !== undefined);
                    for (let nestedEffectsRunner of info.nestedEffectsRunners) nestedEffectsRunner();
                    return null;
                  }, effectsToApply);
                };
                effectsInfos.set(effectsToApply, (info = { runner, nestedEffectsRunners: [] }));
              }
              if (newNestedRunner !== undefined) info.nestedEffectsRunners.push(newNestedRunner);
              newNestedRunner = runner;
              if (runGeneratorAction === undefined) break;
              info.nestedEffectsRunners.push(runGeneratorAction);
              runGeneratorAction = undefined;
            }
            s = this.generatorTree.getParent(s);
          } else if (s instanceof FunctionValue) {
            invariant(this.additionalFunctionValuesAndEffects.has(s));
            s = this.generatorTree.getCreator(s) || "GLOBAL";
          }
          invariant(s instanceof Generator || s instanceof FunctionValue || s === "GLOBAL");
        }
        if (runGeneratorAction !== undefined) {
          invariant(newNestedRunner === undefined);
          runGeneratorAction();
        } else if (newNestedRunner !== undefined) topEffectsRunners.push(newNestedRunner);
      }
      for (let topEffectsRunner of topEffectsRunners) topEffectsRunner();
      invariant(expected === actual);
      if (this.realm.react.verbose) {
        this.logger.logInformation(`  (${actual} items processed)`);
      }
    }
  }

  toInfo(): ResidualHeapInfo {
    return {
      values: this.values,
      functionInstances: this.functionInstances,
      classMethodInstances: this.classMethodInstances,
      functionInfos: this.functionInfos,
      referencedDeclaredValues: this.referencedDeclaredValues,
      additionalFunctionValueInfos: this.additionalFunctionValueInfos,
      declarativeEnvironmentRecordsBindings: this.declarativeEnvironmentRecordsBindings,
      globalBindings: this.globalBindings,
      conditionalFeasibility: this.conditionalFeasibility,
      additionalGeneratorRoots: this.additionalGeneratorRoots,
    };
  }
}
