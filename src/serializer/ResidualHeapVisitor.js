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
  ReferentializationScope,
} from "./types.js";
import { ClosureRefVisitor } from "./visitors.js";
import { Logger } from "../utils/logger.js";
import { Modules } from "../utils/modules.js";
import { ResidualHeapInspector } from "./ResidualHeapInspector.js";
import { Referentializer } from "./Referentializer.js";
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
  capturingFunctions: Set<FunctionValue>,
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
    this.scope = this.globalGenerator = generator;
    this.inspector = new ResidualHeapInspector(realm, logger);
    this.referencedDeclaredValues = new Map();
    this.delayedActions = [];
    this.someReactElement = undefined;
    this.additionalFunctionValuesAndEffects = additionalFunctionValuesAndEffects;
    this.equivalenceSet = new HashSet();
    this.reactElementEquivalenceSet = new ReactElementSet(realm, this.equivalenceSet);
    this.additionalFunctionValueInfos = new Map();
    this.functionToCapturedScopes = new Map();
    this.generatorParents = new Map();
    let environment = realm.$GlobalEnv.environmentRecord;
    invariant(environment instanceof GlobalEnvironmentRecord);
    this.globalEnvironmentRecord = environment;
    this.createdObjects = new Map();
  }

  realm: Realm;
  logger: Logger;
  modules: Modules;
  referentializer: Referentializer | void;
  globalGenerator: Generator;

  // Caches that ensure one ResidualFunctionBinding exists per (record, name) pair
  declarativeEnvironmentRecordsBindings: Map<DeclarativeEnvironmentRecord, Map<string, ResidualFunctionBinding>>;
  globalBindings: Map<string, ResidualFunctionBinding>;

  functionToCapturedScopes: Map<ReferentializationScope, Map<DeclarativeEnvironmentRecord, BindingState>>;
  functionInfos: Map<BabelNodeBlockStatement, FunctionInfo>;
  scope: Scope;
  values: Map<Value, Set<Scope>>;
  inspector: ResidualHeapInspector;
  referencedDeclaredValues: Map<AbstractValue, void | FunctionValue>;
  delayedActions: Array<{| generator: Generator, action: () => void | boolean |}>;
  additionalFunctionValuesAndEffects: Map<FunctionValue, AdditionalFunctionEffects>;
  functionInstances: Map<FunctionValue, FunctionInstance>;
  additionalFunctionValueInfos: Map<FunctionValue, AdditionalFunctionInfo>;
  equivalenceSet: HashSet<AbstractValue>;
  classMethodInstances: Map<FunctionValue, ClassMethodInstance>;
  someReactElement: void | ObjectValue;
  reactElementEquivalenceSet: ReactElementSet;
  generatorParents: Map<Generator, Generator | FunctionValue | "GLOBAL">;
  createdObjects: Map<ObjectValue, void | Generator>;

  globalEnvironmentRecord: GlobalEnvironmentRecord;

  // Going backwards from the current scope, find either the containing
  // additional function, or if there isn't one, return the global generator.
  _getCommonScope(): FunctionValue | Generator {
    let s = this.scope;
    while (true) {
      if (s instanceof Generator) s = this.generatorParents.get(s);
      else if (s instanceof FunctionValue) {
        // Did we find an additional function?
        if (this.additionalFunctionValuesAndEffects.has(s)) return s;

        // Did the function itself get created by a generator we can chase?
        s = this.createdObjects.get(s) || "GLOBAL";
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
  _registerAdditionalRoot(value: ObjectValue) {
    let generator = this.createdObjects.get(value);
    if (generator !== undefined) {
      let s = generator;
      while (s instanceof Generator) {
        s = this.generatorParents.get(s);
      }
      invariant(s === "GLOBAL" || s instanceof FunctionValue);
      let additionalFunction = this._getAdditionalFunctionOfScope();
      if (additionalFunction === s) return;
    } else {
      let additionalFunction = this._getAdditionalFunctionOfScope();
      if (additionalFunction === undefined) return;
      generator = this.globalGenerator;
    }

    this._visitInUnrelatedScope(generator, value);
  }

  // Careful!
  // Only use _withScope when you know that the currently applied effects makes sense for the given (nested) scope!
  _withScope(scope: Scope, f: () => void) {
    let oldScope = this.scope;
    this.scope = scope;
    try {
      f();
    } finally {
      this.scope = oldScope;
    }
  }

  // Queues up an action to be later processed in some arbitrary scope.
  _withUnrelatedScope(scope: Scope, action: () => void | boolean) {
    let generator;
    if (scope instanceof FunctionValue) generator = this.createdObjects.get(scope) || this.globalGenerator;
    else if (scope === "GLOBAL") generator = this.globalGenerator;
    else {
      invariant(scope instanceof Generator);
      generator = scope;
    }
    this.delayedActions.push({ generator, action });
  }

  // Queues up visiting a value in some arbitrary scope.
  _visitInUnrelatedScope(scope: Scope, val: Value) {
    let scopes = this.values.get(val);
    if (scopes !== undefined && scopes.has(scope)) return;
    this._withUnrelatedScope(scope, () => this.visitValue(val));
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
    if (obj.temporalAlias !== undefined) return;

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
    if (absVal.kind === "template for prototype member expression") return;
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
    this._registerAdditionalRoot(val);

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
          let residualBinding = this.getBinding(val, environment, innerName);
          this.visitBinding(val, residualBinding);
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
    let refScope = this._getAdditionalFunctionOfScope() || "GLOBAL";
    invariant(!(refScope instanceof Generator));
    let funcToScopes = getOrDefault(this.functionToCapturedScopes, refScope, () => new Map());
    let envRec = residualFunctionBinding.declarativeEnvironmentRecord;
    invariant(envRec !== null);
    let bindingState = getOrDefault(funcToScopes, envRec, () => ({
      capturedBindings: new Set(),
      capturingFunctions: new Set(),
    }));
    // If the binding is new for this bindingState, have all functions capturing bindings from that scope visit it
    if (!bindingState.capturedBindings.has(residualFunctionBinding)) {
      let value = residualFunctionBinding.value;
      if (value) {
        for (let functionValue of bindingState.capturingFunctions) {
          this._visitInUnrelatedScope(functionValue, value);
        }
      }
      bindingState.capturedBindings.add(residualFunctionBinding);
    }
    // If the function is new for this bindingState, visit all existent bindings in this scope
    if (!bindingState.capturingFunctions.has(val)) {
      for (let residualBinding of bindingState.capturedBindings) {
        if (residualBinding.value) this.visitValue(residualBinding.value);
      }
      bindingState.capturingFunctions.add(val);
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
  getBinding(val: FunctionValue, environment: EnvironmentRecord, name: string): ResidualFunctionBinding {
    if (environment === this.globalEnvironmentRecord.$DeclarativeRecord) environment = this.globalEnvironmentRecord;

    if (environment === this.globalEnvironmentRecord) {
      // Global Binding
      return getOrDefault(
        this.globalBindings,
        name,
        () =>
          ({
            value: this.realm.getGlobalLetBinding(name),
            modified: true,
            declarativeEnvironmentRecord: null,
            potentialReferentializationScopes: new Set(),
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
      return getOrDefault(residualFunctionBindings, name, (): ResidualFunctionBinding => {
        invariant(environment instanceof DeclarativeEnvironmentRecord);
        let binding = environment.bindings[name];
        invariant(binding !== undefined);
        invariant(!binding.deletable);
        return {
          value: (binding.initialized && binding.value) || this.realm.intrinsics.undefined,
          modified: false,
          declarativeEnvironmentRecord: environment,
          potentialReferentializationScopes: new Set(),
        };
      });
    }
  }

  // Visits a binding, returns a ResidualFunctionBinding
  visitBinding(val: FunctionValue, residualFunctionBinding: ResidualFunctionBinding): ResidualFunctionBinding {
    if (residualFunctionBinding.declarativeEnvironmentRecord !== null) {
      let refScope = this._getAdditionalFunctionOfScope() || "GLOBAL";
      residualFunctionBinding.potentialReferentializationScopes.add(refScope);
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
      case "Promise":
        let promiseValue = val.$PromiseValue;
        invariant(promiseValue !== undefined);
        this.visitValue(promiseValue);
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
        this._withScope(this._getCommonScope(), () => {
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
      let commonScope = this._getCommonScope();
      if (this.scope !== val && commonScope !== val) {
        this._withScope(commonScope, () => {
          invariant(val instanceof FunctionValue);
          if (this.preProcessValue(val)) this.visitValueFunction(val, parentScope);
        });
      } else {
        // We didn't call preProcessValue, so let's avoid calling postProcessValue.
        return;
      }
    } else if (val instanceof SymbolValue) {
      if (this.preProcessValue(val)) this.visitValueSymbol(val);
    } else {
      invariant(val instanceof ObjectValue);

      // Prototypes are reachable via function declarations, and those get hoisted, so we need to move
      // prototype initialization to the common scope code as well.
      if (val.originalConstructor !== undefined) {
        this._withScope(this._getCommonScope(), () => {
          invariant(val instanceof ObjectValue);
          if (this.preProcessValue(val)) this.visitValueObject(val);
        });
      } else {
        if (this.preProcessValue(val)) this.visitValueObject(val);
      }
    }
    this.postProcessValue(val);
  }

  createGeneratorVisitCallbacks(additionalFunctionInfo?: AdditionalFunctionInfo): VisitEntryCallbacks {
    let callbacks = {
      visitValues: (values: Array<Value>) => {
        for (let i = 0, n = values.length; i < n; i++) values[i] = this.visitEquivalentValue(values[i]);
      },
      visitGenerator: (generator, parent) => {
        // TODO: The serializer assumes that each generator has a unique parent; however, in the presence of conditional exceptions that is not actually true.
        // invariant(!this.generatorParents.has(generator));
        this.visitGenerator(generator, parent, additionalFunctionInfo);
      },
      canSkip: (value: AbstractValue): boolean => {
        return !this.referencedDeclaredValues.has(value) && !this.values.has(value);
      },
      recordDeclaration: (value: AbstractValue) => {
        this.referencedDeclaredValues.set(value, this._getAdditionalFunctionOfScope());
      },
      recordDelayedEntry: (generator, entry: GeneratorEntry) => {
        this.delayedActions.push({
          generator,
          action: () => entry.visit(callbacks, generator),
        });
      },
      visitObjectProperty: (binding: PropertyBinding) => {
        this.visitObjectProperty(binding);
      },
      visitModifiedBinding: (modifiedBinding: Binding, previousValue: void | Value) => {
        invariant(additionalFunctionInfo);
        let { functionValue } = additionalFunctionInfo;
        invariant(functionValue instanceof ECMAScriptSourceFunctionValue);
        let residualBinding;
        residualBinding = this.getBinding(functionValue, modifiedBinding.environment, modifiedBinding.name);
        this.visitBinding(functionValue, residualBinding);
        invariant(residualBinding !== undefined);
        // named functions inside an additional function that have a global binding
        // can be skipped, as we don't want them to bind to the global
        if (
          residualBinding.declarativeEnvironmentRecord === null &&
          modifiedBinding.value instanceof ECMAScriptSourceFunctionValue
        ) {
          return;
        }
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
    return callbacks;
  }

  visitGenerator(
    generator: Generator,
    parent: Generator | FunctionValue | "GLOBAL",
    additionalFunctionInfo?: AdditionalFunctionInfo
  ): void {
    this.generatorParents.set(generator, parent);
    if (generator.effectsToApply)
      for (const createdObject of generator.effectsToApply[4]) {
        // TODO: Unfortunately, the following invariant doesn't hold. This is concerning.
        // invariant(!this.createdObjects.has(createdObject) || this.createdObjects.get(createdObject) === generator);
        if (!this.createdObjects.has(createdObject)) this.createdObjects.set(createdObject, generator);
      }

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
    let oldEquivalenceSet = this.equivalenceSet;
    this.equivalenceSet = new HashSet();
    let oldReactElementEquivalenceSet = this.reactElementEquivalenceSet;
    this.reactElementEquivalenceSet = new ReactElementSet(this.realm, this.equivalenceSet);

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

    let effectsGenerator = additionalEffects.generator;
    this.visitGenerator(effectsGenerator, functionValue, additionalFunctionInfo);

    // Cleanup
    this.reactElementEquivalenceSet = oldReactElementEquivalenceSet;
    this.equivalenceSet = oldEquivalenceSet;
    this._withScope(
      parentScope,
      // Re-visit any bindings corresponding to unbound values or values closed over from outside additional function
      // they're serialized in the correct scope
      () => {
        invariant(functionInfo !== undefined);
        invariant(funcInstance !== undefined);
        for (let [modifiedBinding, oldValue] of additionalEffects.generator.getModifiedBindingOldValues()) {
          invariant(oldValue !== undefined);
          let residualBinding = this.getBinding(functionValue, modifiedBinding.environment, modifiedBinding.name);
          // Fixup the binding to have the correct value
          // No previousValue means this is a binding for a nested function
          residualBinding.value = this.visitEquivalentValue(oldValue);
          this.visitBinding(functionValue, residualBinding);
          invariant(residualBinding !== undefined);
          funcInstance.residualFunctionBindings.set(modifiedBinding.name, residualBinding);
          // TODO nested optimized functions: revisit adding GLOBAL as outer optimized function
          residualBinding.potentialReferentializationScopes.add("GLOBAL");
        }
      }
    );
  }

  visitRoots(): void {
    this.visitGenerator(this.globalGenerator, "GLOBAL");
    for (let moduleValue of this.modules.initializedModules.values()) this.visitValue(moduleValue);
    if (this.realm.react.enabled && this.someReactElement !== undefined) {
      this._visitReactLibrary(this.someReactElement);
    }

    // Do a fixpoint over all pure generator entries to make sure that we visit
    // arguments of only BodyEntries that are required by some other residual value
    let progress = true;
    while (progress) {
      // Let's partition the actions by their generators,
      // as applying effects is expensive, and so we don't want to do it
      // more often than necessary.
      let actionsByGenerator = new Map();
      for (let { generator, action } of this.delayedActions.reverse()) {
        let a = actionsByGenerator.get(generator);
        if (a === undefined) actionsByGenerator.set(generator, (a = []));
        a.push(action);
      }
      this.delayedActions = [];
      progress = false;
      for (let [generator, actions] of actionsByGenerator) {
        let withEffectsAppliedInGlobalEnv: (() => void) => void = f => f();
        let s = generator;
        let visited = new Set();
        while (s !== "GLOBAL") {
          invariant(!visited.has(s));
          visited.add(s);
          if (s instanceof Generator) {
            let effectsToApply = s.effectsToApply;
            if (effectsToApply) {
              let outer = withEffectsAppliedInGlobalEnv;
              withEffectsAppliedInGlobalEnv = f =>
                outer(() => {
                  this.realm.withEffectsAppliedInGlobalEnv(() => {
                    f();
                    return null;
                  }, effectsToApply);
                });
            }
            s = this.generatorParents.get(s);
          } else if (s instanceof FunctionValue) {
            invariant(this.additionalFunctionValuesAndEffects.has(s));
            s = this.createdObjects.get(s) || "GLOBAL";
          }
          invariant(s instanceof Generator || s instanceof FunctionValue || s === "GLOBAL");
        }

        this._withScope(generator, () =>
          withEffectsAppliedInGlobalEnv(() => {
            for (let action of actions) if (action() !== false) progress = true;
          })
        );
      }
    }

    // Make sure to visit all global bindings in global scope
    this._withScope(this.globalGenerator, () => {
      for (let binding of this.globalBindings.values()) if (binding.value) this.visitValue(binding.value);
    });

    let referentializer = this.referentializer;
    if (referentializer !== undefined)
      for (let instance of this.functionInstances.values()) referentializer.referentialize(instance);
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
