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
import { Realm } from "../realm.js";
import type { Descriptor, PropertyBinding, ObjectKind } from "../types.js";
import type { Binding } from "../environment.js";
import { HashSet, IsArray, Get } from "../methods/index.js";
import {
  AbstractObjectValue,
  AbstractValue,
  BoundFunctionValue,
  ECMAScriptFunctionValue,
  ECMAScriptSourceFunctionValue,
  EmptyValue,
  FunctionValue,
  NativeFunctionValue,
  ObjectValue,
  ProxyValue,
  SymbolValue,
  UndefinedValue,
  Value,
} from "../values/index.js";
import { describeLocation } from "../intrinsics/ecma262/Error.js";
import * as t from "babel-types";
import type { BabelNodeBlockStatement } from "babel-types";
import { Generator } from "../utils/generator.js";
import type { GeneratorEntry, VisitEntryCallbacks } from "../utils/generator.js";
import traverse from "babel-traverse";
import invariant from "../invariant.js";
import type {
  AdditionalFunctionEffects,
  AdditionalFunctionInfo,
  ClassMethodInstance,
  FunctionInfo,
  FunctionInstance,
  ResidualFunctionBinding,
} from "./types.js";
import { ClosureRefVisitor } from "./visitors.js";
import { Logger } from "../utils/logger.js";
import { Modules } from "../utils/modules.js";
import { ResidualHeapInspector } from "./ResidualHeapInspector.js";
import { Referentializer } from "./Referentializer.js";
import type { ReferentializationScope } from "./Referentializer.js";
import {
  canIgnoreClassLengthProperty,
  ClassPropertiesToIgnore,
  getObjectPrototypeMetadata,
  getOrDefault,
  getSuggestedArrayLiteralLength,
  withDescriptorValue,
} from "./utils.js";
import { Environment, To } from "../singletons.js";
import { isReactElement, valueIsReactLibraryObject } from "../react/utils.js";
import { canHoistReactElement } from "../react/hoisting.js";
import ReactElementSet from "../react/ReactElementSet.js";

export type Scope = FunctionValue | Generator;
type BindingState = {|
  capturedBindings: Set<ResidualFunctionBinding>,
  capturingFunctionsToCommonScope: Map<FunctionValue, Scope>,
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
    additionalFunctionValuesAndEffects: Map<FunctionValue, AdditionalFunctionEffects>,
    // Referentializer is null if we're just checking what values exist
    referentializer: Referentializer | "NO_REFERENTIALIZE"
  ) {
    invariant(realm.useAbstractInterpretation);
    this.realm = realm;
    this.logger = logger;
    this.modules = modules;
    this.referentializer = referentializer === "NO_REFERENTIALIZE" ? undefined : referentializer;

    this.declarativeEnvironmentRecordsBindings = new Map();
    this.globalBindings = new Map();
    this.functionInfos = new Map();
    this.classMethodInstances = new Map();
    this.functionInstances = new Map();
    this.values = new Map();
    let generator = this.realm.generator;
    invariant(generator);
    this.scope = this.commonScope = generator;
    this.inspector = new ResidualHeapInspector(realm, logger);
    this.referencedDeclaredValues = new Map();
    this.delayedVisitGeneratorEntries = [];
    this.someReactElement = undefined;
    this.additionalFunctionValuesAndEffects = additionalFunctionValuesAndEffects;
    this.equivalenceSet = new HashSet();
    this.reactElementEquivalenceSet = new ReactElementSet(realm, this.equivalenceSet);
    this.additionalFunctionValueInfos = new Map();
    this.containingAdditionalFunction = undefined;
    this.additionalRoots = new Map();
    this.inClass = false;
    this.functionToCapturedScopes = new Map();
    this.generatorParents = new Map();
    let environment = realm.$GlobalEnv.environmentRecord;
    invariant(environment instanceof GlobalEnvironmentRecord);
    this.globalEnvironmentRecord = environment;
    this.createdObjects = new Set();
  }

  realm: Realm;
  logger: Logger;
  modules: Modules;
  referentializer: Referentializer | void;

  // Caches that ensure one ResidualFunctionBinding exists per (record, name) pair
  declarativeEnvironmentRecordsBindings: Map<DeclarativeEnvironmentRecord, Map<string, ResidualFunctionBinding>>;
  globalBindings: Map<string, ResidualFunctionBinding>;

  functionToCapturedScopes: Map<ReferentializationScope, Map<DeclarativeEnvironmentRecord, BindingState>>;
  functionInfos: Map<BabelNodeBlockStatement, FunctionInfo>;
  scope: Scope;
  // Either the realm's generator or the FunctionValue of an additional function to serialize
  commonScope: Scope;
  values: Map<Value, Set<Scope>>;
  inspector: ResidualHeapInspector;
  referencedDeclaredValues: Map<AbstractValue, void | FunctionValue>;
  delayedVisitGeneratorEntries: Array<{| commonScope: Scope, generator: Generator, entry: GeneratorEntry |}>;
  additionalFunctionValuesAndEffects: Map<FunctionValue, AdditionalFunctionEffects>;
  functionInstances: Map<FunctionValue, FunctionInstance>;
  additionalFunctionValueInfos: Map<FunctionValue, AdditionalFunctionInfo>;
  equivalenceSet: HashSet<AbstractValue>;
  classMethodInstances: Map<FunctionValue, ClassMethodInstance>;
  someReactElement: void | ObjectValue;
  reactElementEquivalenceSet: ReactElementSet;
  generatorParents: Map<Generator, Generator>;

  // We only want to add to additionalRoots when we're in an additional function
  containingAdditionalFunction: void | FunctionValue;
  // CreatedObjects corresponding to the union of the createdObjects for all the effects that are
  // currently applied
  createdObjects: Set<ObjectValue>;
  // Tracks objects + functions that were visited from inside additional functions that need to be serialized in a
  // parent scope of the additional function (e.g. functions/objects only used from additional functions that were
  // declared outside the additional function need to be serialized in the additional function's parent scope for
  // identity to work).
  additionalRoots: Map<ObjectValue, Set<FunctionValue>>;
  inClass: boolean;

  globalEnvironmentRecord: GlobalEnvironmentRecord;

  _registerAdditionalRoot(value: ObjectValue) {
    let additionalFunction = this.containingAdditionalFunction;
    if (additionalFunction !== undefined && !this.inClass) {
      // If the value is a member of CreatedObjects, it isn't an additional root
      invariant(this.createdObjects);
      if (this.createdObjects.has(value)) return;
      let s = this.additionalRoots.get(value);
      if (s === undefined) this.additionalRoots.set(value, (s = new Set()));
      s.add(additionalFunction);
    }
  }

  _withScope(scope: Scope, f: () => void) {
    let oldScope = this.scope;
    this.scope = scope;
    try {
      f();
    } finally {
      this.scope = oldScope;
    }
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
    let { skipPrototype, constructor } = getObjectPrototypeMetadata(this.realm, obj);

    // visit properties
    if (!isReactElement(obj)) {
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
    if (!isReactElement(obj) && !skipPrototype) {
      // we don't want to the ReactElement prototype visited
      // as this is contained within the JSXElement, otherwise
      // they we be need to be emitted during serialization
      this.visitObjectPrototype(obj);
    }
    if (obj instanceof FunctionValue) {
      this.visitConstructorPrototype(constructor ? constructor : obj);
    } else if (obj instanceof ObjectValue && skipPrototype && constructor) {
      this.visitValue(constructor);
    }
  }

  visitObjectPrototype(obj: ObjectValue) {
    let proto = obj.$Prototype;

    let kind = obj.getKind();
    if (proto === this.realm.intrinsics[kind + "Prototype"]) return;

    if (!obj.$IsClassPrototype || proto !== this.realm.intrinsics.null) {
      this.visitValue(proto);
    }
  }

  visitConstructorPrototype(func: Value) {
    // If the original prototype object was mutated,
    // request its serialization here as this might be observable by
    // residual code.
    invariant(func instanceof FunctionValue);
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
    if (absVal.kind === "widened property") return;
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

  visitValueArray(val: ObjectValue): void {
    this.visitObjectProperties(val);
    const realm = this.realm;
    let lenProperty;
    if (val.isHavocedObject()) {
      lenProperty = this.realm.evaluateWithoutLeakLogic(() => Get(realm, val, "length"));
    } else {
      lenProperty = Get(realm, val, "length");
    }
    if (
      lenProperty instanceof AbstractValue
        ? lenProperty.kind !== "widened property"
        : To.ToLength(realm, lenProperty) !== getSuggestedArrayLiteralLength(realm, val)
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

  visitValueFunction(val: FunctionValue, parentScope: Scope): void {
    let isClass = false;

    this._registerAdditionalRoot(val);
    if (val instanceof ECMAScriptFunctionValue && val.$FunctionKind === "classConstructor") {
      invariant(val instanceof ECMAScriptSourceFunctionValue);
      let homeObject = val.$HomeObject;
      if (homeObject instanceof ObjectValue && homeObject.$IsClassPrototype) {
        isClass = true;
        this.inClass = true;
      }
    }
    this.visitObjectProperties(val);
    if (isClass && this.inClass) {
      this.inClass = false;
    }

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
        unbound: new Set(),
        modified: new Set(),
        usesArguments: false,
        usesThis: false,
      };
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
      this._visitAdditionalFunction(val, additionalFunctionEffects, parentScope);
    } else {
      this._withScope(val, () => {
        invariant(functionInfo);
        for (let innerName of functionInfo.unbound) {
          let environment = this.resolveBinding(val, innerName);
          let residualBinding = this.visitBinding(val, environment, innerName);
          invariant(residualBinding !== undefined);
          residualFunctionBindings.set(innerName, residualBinding);
          if (functionInfo.modified.has(innerName)) {
            residualBinding.modified = true;
          }
        }
      });
    }
    if (isClass && val.$HomeObject instanceof ObjectValue) {
      this._visitClass(val, val.$HomeObject);
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
  _recordBindingVisitedAndRevisit(val: FunctionValue, residualFunctionBinding: ResidualFunctionBinding) {
    let refScope = this.containingAdditionalFunction ? this.containingAdditionalFunction : "GLOBAL";
    invariant(!(refScope instanceof Generator));
    let funcToScopes = getOrDefault(this.functionToCapturedScopes, refScope, () => new Map());
    let envRec = residualFunctionBinding.declarativeEnvironmentRecord;
    invariant(envRec !== null);
    let bindingState = getOrDefault(funcToScopes, envRec, () => ({
      capturedBindings: new Set(),
      capturingFunctionsToCommonScope: new Map(),
    }));
    // If the binding is new for this bindingState, have all functions capturing bindings from that scope visit it
    if (!bindingState.capturedBindings.has(residualFunctionBinding)) {
      if (residualFunctionBinding.value) {
        invariant(this);
        for (let [functionValue, functionCommonScope] of bindingState.capturingFunctionsToCommonScope) {
          invariant(this);
          let prevCommonScope = this.commonScope;
          try {
            this.commonScope = functionCommonScope;
            let value = residualFunctionBinding.value;
            this._withScope(functionValue, () => this.visitValue(value));
          } finally {
            this.commonScope = prevCommonScope;
          }
        }
      }
      bindingState.capturedBindings.add(residualFunctionBinding);
    }
    // If the function is new for this bindingState, visit all existent bindings in this scope
    if (!bindingState.capturingFunctionsToCommonScope.has(val)) {
      for (let residualBinding of bindingState.capturedBindings) {
        if (residualBinding.value) this.visitValue(residualBinding.value);
      }
      bindingState.capturingFunctionsToCommonScope.set(val, this.commonScope);
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

  // Visits a binding, returns a ResidualFunctionBinding
  visitBinding(val: FunctionValue, environment: EnvironmentRecord, name: string): ResidualFunctionBinding {
    if (environment === this.globalEnvironmentRecord.$DeclarativeRecord) environment = this.globalEnvironmentRecord;

    let residualFunctionBinding;
    let createdBinding;
    if (environment === this.globalEnvironmentRecord) {
      // Global Binding
      createdBinding = !this.globalBindings.has(name);
      residualFunctionBinding = getOrDefault(
        this.globalBindings,
        name,
        () =>
          ({
            value: this.realm.getGlobalLetBinding(name),
            modified: true,
            declarativeEnvironmentRecord: null,
          }: ResidualFunctionBinding)
      );
    } else {
      invariant(environment instanceof DeclarativeEnvironmentRecord);
      // DeclarativeEnvironmentRecord binding
      let residualFunctionBindings = getOrDefault(
        this.declarativeEnvironmentRecordsBindings,
        environment,
        () => new Map()
      );
      createdBinding = !residualFunctionBindings.has(name);
      residualFunctionBinding = getOrDefault(residualFunctionBindings, name, (): ResidualFunctionBinding => {
        invariant(environment instanceof DeclarativeEnvironmentRecord);
        let binding = environment.bindings[name];
        invariant(binding !== undefined);
        invariant(!binding.deletable);
        return {
          value: (binding.initialized && binding.value) || this.realm.intrinsics.undefined,
          modified: false,
          declarativeEnvironmentRecord: environment,
        };
      });
      if (this.containingAdditionalFunction && createdBinding)
        residualFunctionBinding.referencedOnlyFromAdditionalFunctions = this.containingAdditionalFunction;
      if (!this.containingAdditionalFunction && residualFunctionBinding.referencedOnlyFromAdditionalFunctions)
        delete residualFunctionBinding.referencedOnlyFromAdditionalFunctions;
      this._recordBindingVisitedAndRevisit(val, residualFunctionBinding);
    }
    if (residualFunctionBinding.value) {
      let equivalentValue = this.visitEquivalentValue(residualFunctionBinding.value);
      residualFunctionBinding.value = equivalentValue;
    }
    return residualFunctionBinding;
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
    this._registerAdditionalRoot(val);
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
      case "ReactElement":
        if (this.realm.react.output === "create-element") {
          this.someReactElement = val;
        }
        // check we can hoist a React Element
        canHoistReactElement(this.realm, val, this);
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

  // Overridable hook for pre-visiting the value.
  // Return false will tell visitor to skip visiting children of this node.
  preProcessValue(val: Value): boolean {
    return this._mark(val);
  }

  // Overridable hook for post-visiting the value.
  postProcessValue(val: Value) {}

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
      if (this.preProcessValue(equivalentValue)) this.visitAbstractValue(equivalentValue);
      this.postProcessValue(equivalentValue);
      return (equivalentValue: any);
    }
    if (val instanceof ObjectValue && isReactElement(val)) {
      let equivalentReactElementValue = this.reactElementEquivalenceSet.add(val);
      if (this._mark(equivalentReactElementValue)) this.visitValueObject(equivalentReactElementValue);
      return (equivalentReactElementValue: any);
    }
    this.visitValue(val);
    return val;
  }

  visitValue(val: Value): void {
    invariant(!(val instanceof ObjectValue && val.refuseSerialization));
    if (val instanceof AbstractValue) {
      if (this.preProcessValue(val)) this.visitAbstractValue(val);
    } else if (val.isIntrinsic()) {
      // All intrinsic values exist from the beginning of time...
      // ...except for a few that come into existence as templates for abstract objects via executable code.
      if (val instanceof ObjectValue && val._isScopedTemplate) this.preProcessValue(val);
      else
        this._withScope(this.commonScope, () => {
          this.preProcessValue(val);
        });
    } else if (val instanceof EmptyValue) {
      this.preProcessValue(val);
    } else if (ResidualHeapInspector.isLeaf(val)) {
      this.preProcessValue(val);
    } else if (IsArray(this.realm, val)) {
      invariant(val instanceof ObjectValue);
      if (this.preProcessValue(val)) this.visitValueArray(val);
    } else if (val instanceof ProxyValue) {
      if (this.preProcessValue(val)) this.visitValueProxy(val);
    } else if (val instanceof FunctionValue) {
      // Function declarations should get hoisted in common scope so that instances only get allocated once
      let parentScope = this.scope;
      // Every function references itself through arguments, prevent the recursive double-visit
      if (this.scope !== val && this.commonScope !== val)
        this._withScope(this.commonScope, () => {
          invariant(val instanceof FunctionValue);
          if (this.preProcessValue(val)) this.visitValueFunction(val, parentScope);
        });
    } else if (val instanceof SymbolValue) {
      if (this.preProcessValue(val)) this.visitValueSymbol(val);
    } else {
      invariant(val instanceof ObjectValue);

      // Prototypes are reachable via function declarations, and those get hoisted, so we need to move
      // prototype initialization to the common scope code as well.
      if (val.originalConstructor !== undefined) {
        this._withScope(this.commonScope, () => {
          invariant(val instanceof ObjectValue);
          if (this.preProcessValue(val)) this.visitValueObject(val);
        });
      } else {
        if (this.preProcessValue(val)) this.visitValueObject(val);
      }
    }
    this.postProcessValue(val);
  }

  createGeneratorVisitCallbacks(
    commonScope: Scope,
    additionalFunctionInfo?: AdditionalFunctionInfo
  ): VisitEntryCallbacks {
    return {
      visitValues: (values: Array<Value>) => {
        for (let i = 0, n = values.length; i < n; i++) values[i] = this.visitEquivalentValue(values[i]);
      },
      visitGenerator: (generator, parent) => {
        // TODO: The serializer assumes that each generator has a unique parent; however, in the presence of conditional exceptions that is not actually true.
        // invariant(!this.generatorParents.has(generator));
        this.generatorParents.set(generator, parent);
        this.visitGenerator(generator, additionalFunctionInfo);
      },
      canSkip: (value: AbstractValue): boolean => {
        return !this.referencedDeclaredValues.has(value) && !this.values.has(value);
      },
      recordDeclaration: (value: AbstractValue) => {
        this.referencedDeclaredValues.set(value, this.containingAdditionalFunction);
      },
      recordDelayedEntry: (generator, entry: GeneratorEntry) => {
        this.delayedVisitGeneratorEntries.push({ commonScope, generator, entry });
      },
      visitObjectProperty: (binding: PropertyBinding) => {
        this.visitObjectProperty(binding);
      },
      visitModifiedBinding: (modifiedBinding: Binding, previousValue: void | Value) => {
        invariant(additionalFunctionInfo);
        let { functionValue } = additionalFunctionInfo;
        invariant(functionValue instanceof ECMAScriptSourceFunctionValue);
        let code = functionValue.$ECMAScriptCode;
        let functionInfo = this.functionInfos.get(code);
        let residualBinding;
        this._withScope(functionValue, () => {
          // Also visit the original value of the binding
          residualBinding = this.visitBinding(functionValue, modifiedBinding.environment, modifiedBinding.name);
          invariant(residualBinding !== undefined);
          // named functions inside an additional function that have a global binding
          // can be skipped, as we don't want them to bind to the global
          if (
            residualBinding.declarativeEnvironmentRecord === null &&
            modifiedBinding.value instanceof ECMAScriptSourceFunctionValue
          ) {
            residualBinding = null;
            return;
          }
          // Fixup the binding to have the correct value
          // No previousValue means this is a binding for a nested function
          if (previousValue && residualBinding.value === modifiedBinding.value)
            residualBinding.value = this.visitEquivalentValue(previousValue);
          invariant(functionInfo !== undefined);
          if (functionInfo.modified.has(modifiedBinding.name)) residualBinding.modified;
        });
        if (residualBinding === null) return;
        invariant(residualBinding);
        let funcInstance = additionalFunctionInfo.instance;
        invariant(funcInstance !== undefined);
        funcInstance.residualFunctionBindings.set(modifiedBinding.name, residualBinding);
        let newValue = modifiedBinding.value;
        invariant(newValue);
        this.visitValue(newValue);
        residualBinding.modified = true;
        // This should be enforced by checkThatFunctionsAreIndependent
        invariant(
          !residualBinding.additionalFunctionOverridesValue ||
            residualBinding.additionalFunctionOverridesValue === functionValue,
          "We should only have one additional function value modifying any given residual binding"
        );
        if (previousValue) residualBinding.additionalFunctionOverridesValue = functionValue;
        additionalFunctionInfo.modifiedBindings.set(modifiedBinding, residualBinding);
        return residualBinding;
      },
    };
  }

  visitGenerator(generator: Generator, additionalFunctionInfo?: AdditionalFunctionInfo): void {
    let oldCreatedObjects;
    if (generator.effectsToApply) {
      oldCreatedObjects = this.createdObjects;
      this.createdObjects = new Set([...oldCreatedObjects, ...generator.effectsToApply[4]]);
    }
    this._withScope(generator, () => {
      generator.visit(this.createGeneratorVisitCallbacks(this.commonScope, additionalFunctionInfo));
    });
    if (oldCreatedObjects) this.createdObjects = oldCreatedObjects;
  }

  // result -- serialized as a return statement
  // Generator -- visit all entries
  // Bindings -- (modifications to named variables) only need to serialize bindings if they're
  //             captured by a residual function
  //          -- need to apply them and maybe need to revisit functions in ancestors to make sure
  //             we don't overwrite anything they capture
  // PropertyBindings -- (property modifications) visit any property bindings to pre-existing objects
  // CreatedObjects -- should take care of itself
  _visitAdditionalFunction(
    functionValue: FunctionValue,
    additionalEffects: AdditionalFunctionEffects,
    parentScope: Scope
  ) {
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
    let prevCommonScope = this.commonScope;
    this.commonScope = functionValue;
    let oldEquivalenceSet = this.equivalenceSet;
    this.equivalenceSet = new HashSet();
    let oldReactElementEquivalenceSet = this.reactElementEquivalenceSet;
    this.reactElementEquivalenceSet = new ReactElementSet(this.realm, this.equivalenceSet);
    let oldcontainingAdditionalFunction = this.containingAdditionalFunction;
    this.containingAdditionalFunction = functionValue;
    let prevReVisit = this.additionalRoots;
    this.additionalRoots = new Map();

    let modifiedBindingInfo = new Map();
    let [result] = additionalEffects.effects;

    invariant(funcInstance !== undefined);
    invariant(functionInfo !== undefined);
    let additionalFunctionInfo = {
      functionValue,
      captures: functionInfo.unbound,
      modifiedBindings: modifiedBindingInfo,
      instance: funcInstance,
      hasReturn: !(result instanceof UndefinedValue),
    };
    this.additionalFunctionValueInfos.set(functionValue, additionalFunctionInfo);

    this._withScope(functionValue, () => {
      let effectsGenerator = additionalEffects.generator;
      let oldCreatedObjects;
      if (effectsGenerator.effectsToApply) {
        oldCreatedObjects = this.createdObjects;
        this.createdObjects = new Set([...oldCreatedObjects, ...effectsGenerator.effectsToApply[4]]);
      }
      this.visitGenerator(effectsGenerator, additionalFunctionInfo);
      if (oldCreatedObjects) this.createdObjects = oldCreatedObjects;
    });

    // Cleanup
    this.commonScope = prevCommonScope;
    this.reactElementEquivalenceSet = oldReactElementEquivalenceSet;
    this.equivalenceSet = oldEquivalenceSet;
    this._withScope(
      parentScope,
      // Re-visit any bindings corresponding to unbound values or values closed over from outside additional function
      // they're serialized in the correct scope
      () => {
        invariant(functionInfo !== undefined);
        invariant(funcInstance !== undefined);
        for (let [value, additionalParentGenerators] of this.additionalRoots) {
          // Populate old additionalRoots because we switched them out
          prevReVisit.set(value, additionalParentGenerators);
          this.visitValue(value);
        }
        for (let innerName of functionInfo.unbound) {
          let environment = this.resolveBinding(functionValue, innerName);
          let residualBinding = this.visitBinding(functionValue, environment, innerName);
          invariant(residualBinding !== undefined);
          funcInstance.residualFunctionBindings.set(innerName, residualBinding);
          delete residualBinding.referencedOnlyFromAdditionalFunctions;
        }
        this.additionalRoots = prevReVisit;
      }
    );
    this.containingAdditionalFunction = oldcontainingAdditionalFunction;
  }

  visitRoots(): void {
    let generator = this.realm.generator;
    invariant(generator);
    this.visitGenerator(generator);
    for (let moduleValue of this.modules.initializedModules.values()) this.visitValue(moduleValue);
    if (this.realm.react.enabled && this.someReactElement !== undefined) {
      this._visitReactLibrary(this.someReactElement);
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
          entry.visit(this.createGeneratorVisitCallbacks(commonScope), entryGenerator);
        });
      }
    }

    let referentializer = this.referentializer;
    if (referentializer !== undefined) {
      let bodyToInstances = new Map();
      for (let instance of this.functionInstances.values()) {
        let code = instance.functionValue.$ECMAScriptCode;
        invariant(code !== undefined);
        getOrDefault(bodyToInstances, code, () => []).push(instance);
      }

      for (let [funcBody, instances] of bodyToInstances) {
        let functionInfo = this.functionInfos.get(funcBody);
        invariant(functionInfo !== undefined);
        referentializer.referentialize(functionInfo.unbound, instances);
      }
    }
  }

  _visitReactLibrary(someReactElement: ObjectValue) {
    // find and visit the React library
    let reactLibraryObject = this.realm.fbLibraries.react;
    if (this.realm.react.output === "jsx") {
      // React might not be defined in scope, i.e. another library is using JSX
      // we don't throw an error as we should support JSX stand-alone
      if (reactLibraryObject !== undefined) {
        this.visitValue(reactLibraryObject);
      }
    } else if (this.realm.react.output === "create-element") {
      let logError = () => {
        this.logger.logError(
          someReactElement,
          "unable to visit createElement due to React not being referenced in scope"
        );
      };
      // createElement output needs React in scope
      if (reactLibraryObject === undefined) {
        logError();
      } else {
        invariant(reactLibraryObject instanceof ObjectValue);
        let createElement = reactLibraryObject.properties.get("createElement");
        if (createElement === undefined || createElement.descriptor === undefined) {
          logError();
        } else {
          let reactCreateElement = Get(this.realm, reactLibraryObject, "createElement");
          this.visitValue(reactCreateElement);
        }
      }
    }
  }
}
