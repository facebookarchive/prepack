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
import { IsUnresolvableReference, ToLength, ResolveBinding, HashSet, IsArray, Get } from "../methods/index.js";
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
  constructor(
    realm: Realm,
    logger: Logger,
    modules: Modules,
    additionalFunctionValuesAndEffects: Map<FunctionValue, Effects>
  ) {
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
    this.scope = this.commonScope = generator;
    this.inspector = new ResidualHeapInspector(realm, logger);
    this.referencedDeclaredValues = new Set();
    this.delayedVisitGeneratorEntries = [];
    this.additionalFunctionValuesAndEffects = additionalFunctionValuesAndEffects;
    this.equivalenceSet = new HashSet();
  }

  realm: Realm;
  logger: Logger;
  modules: Modules;

  declarativeEnvironmentRecordsBindings: Map<DeclarativeEnvironmentRecord, VisitedBindings>;
  globalBindings: Map<string, VisitedBinding>;
  functionInfos: Map<BabelNodeBlockStatement, FunctionInfo>;
  functionBindings: Map<FunctionValue, VisitedBindings>;
  scope: Scope;
  // Either the realm's generator or the FunctionValue of an additional function to serialize
  commonScope: Scope;
  values: Map<Value, Set<Scope>>;
  inspector: ResidualHeapInspector;
  referencedDeclaredValues: Set<AbstractValue>;
  delayedVisitGeneratorEntries: Array<{| commonScope: Scope, generator: Generator, entry: GeneratorEntry |}>;
  additionalFunctionValuesAndEffects: Map<FunctionValue, Effects>;
  equivalenceSet: HashSet<AbstractValue>;

  _withScope(scope: Scope, f: () => boolean): boolean {
    let oldScope = this.scope;
    this.scope = scope;
    let result = f();
    this.scope = oldScope;
    return result;
  }

  visitObjectProperty(binding: PropertyBinding) {
    let desc = binding.descriptor;
    if (desc === undefined) return true; //deleted
    let obj = binding.object;
    if (obj instanceof AbstractObjectValue || !this.inspector.canIgnoreProperty(obj, binding.key)) {
      return this.visitDescriptor(desc);
    }
    return true;
  }

  visitObjectProperties(obj: ObjectValue): boolean {
    // visit properties
    let passCheck = true;
    for (let [symbol, propertyBinding] of obj.symbols) {
      invariant(propertyBinding);
      let desc = propertyBinding.descriptor;
      if (desc === undefined) continue; //deleted
      passCheck = this.visitDescriptor(desc);
      if (!passCheck) {
        return false;
      }
      passCheck = this.visitValue(symbol);
      if (!passCheck) {
        return false;
      }
    }

    // visit properties
    for (let propertyBinding of obj.properties.values()) {
      invariant(propertyBinding);
      passCheck = this.visitObjectProperty(propertyBinding);
      if (!passCheck) {
        return false;
      }
    }

    // inject properties with computed names
    if (obj.unknownProperty !== undefined) {
      let desc = obj.unknownProperty.descriptor;
      if (desc !== undefined) {
        let val = desc.value;
        invariant(val instanceof AbstractValue);
        passCheck = this.visitObjectPropertiesWithComputedNames(val);
        if (!passCheck) {
          return false;
        }
      }
    }

    // prototype
    passCheck = this.visitObjectPrototype(obj);
    if (!passCheck) {
      return false;
    }
    if (obj instanceof FunctionValue) {
      passCheck = this.visitConstructorPrototype(obj);
    }
    return passCheck;
  }

  visitObjectPrototype(obj: ObjectValue): boolean {
    let proto = obj.$Prototype;

    let kind = obj.getKind();
    if (proto === this.realm.intrinsics[kind + "Prototype"]) return true;

    return this.visitValue(proto);
  }

  visitConstructorPrototype(func: FunctionValue): boolean {
    // If the original prototype object was mutated,
    // request its serialization here as this might be observable by
    // residual code.
    let passCheck = true;
    let prototype = ResidualHeapInspector.getPropertyValue(func, "prototype");
    if (
      prototype instanceof ObjectValue &&
      prototype.originalConstructor === func &&
      !this.inspector.isDefaultPrototype(prototype)
    ) {
      passCheck = this.visitValue(prototype);
    }
    return passCheck;
  }

  visitObjectPropertiesWithComputedNames(absVal: AbstractValue): boolean {
    invariant(absVal.args.length === 3);
    let cond = absVal.args[0];
    invariant(cond instanceof AbstractValue);
    let passCheck = true;
    if (cond.kind === "template for property name condition") {
      let P = cond.args[0];
      invariant(P instanceof AbstractValue);
      let V = absVal.args[1];
      let earlier_props = absVal.args[2];
      if (earlier_props instanceof AbstractValue) {
        passCheck = this.visitObjectPropertiesWithComputedNames(earlier_props);
        if (!passCheck) {
          return false;
        }
      }
      passCheck = this.visitValue(P);
      if (!passCheck) {
        return false;
      }
      passCheck = this.visitValue(V);
      if (!passCheck) {
        return false;
      }
    } else {
      // conditional assignment
      let retVal;
      [retVal, passCheck] = this.visitEquivalentValue(cond);
      absVal.args[0] = retVal;
      if (!passCheck) {
        return false;
      }
      let consequent = absVal.args[1];
      invariant(consequent instanceof AbstractValue);
      let alternate = absVal.args[2];
      invariant(alternate instanceof AbstractValue);
      passCheck = this.visitObjectPropertiesWithComputedNames(consequent);
      if (!passCheck) {
        return false;
      }
      passCheck = this.visitObjectPropertiesWithComputedNames(alternate);
    }
    return passCheck;
  }

  visitDescriptor(desc: Descriptor): boolean {
    let passCheck = true;
    if (desc.value !== undefined) {
      let retVal;
      [retVal, passCheck] = this.visitEquivalentValue(desc.value);
      desc.value = retVal;
      if (!passCheck) {
        return false;
      }
    }
    if (desc.get !== undefined) {
      passCheck = this.visitValue(desc.get);
      if (!passCheck) {
        return false;
      }
    }
    if (desc.set !== undefined) {
      passCheck = this.visitValue(desc.set);
    }
    return passCheck;
  }

  visitDeclarativeEnvironmentRecordBinding(r: DeclarativeEnvironmentRecord, n: string): VisitedBinding {
    let visitedBindings = this.declarativeEnvironmentRecordsBindings.get(r);
    if (!visitedBindings) {
      visitedBindings = (Object.create(null): any);
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
    visitedBinding.value = this.visitEquivalentValue(visitedBinding.value)[0];
    return visitedBinding;
  }

  visitValueArray(val: ObjectValue): boolean {
    let passCheck = this.visitObjectProperties(val);
    if (!passCheck) {
      return false;
    }
    const realm = this.realm;
    let lenProperty = Get(realm, val, "length");
    if (
      lenProperty instanceof AbstractValue ||
      ToLength(realm, lenProperty) !== getSuggestedArrayLiteralLength(realm, val)
    ) {
      passCheck = this.visitValue(lenProperty);
    }
    return passCheck;
  }

  visitValueMap(val: ObjectValue): boolean {
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

    let passCheck = true;
    for (let i = 0; i < len; i++) {
      let entry = entries[i];
      let key = entry.$Key;
      let value = entry.$Value;
      if (key === undefined || value === undefined) continue;
      passCheck = this.visitValue(key);
      if (!passCheck) {
        return false;
      }
      passCheck = this.visitValue(value);
      if (!passCheck) {
        return false;
      }
    }
    return passCheck;
  }

  visitValueSet(val: ObjectValue): boolean {
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

    let passCheck = true;
    for (let i = 0; i < len; i++) {
      let entry = entries[i];
      if (entry === undefined) continue;
      passCheck = this.visitValue(entry);
      if (!passCheck) {
        return false;
      }
    }
    return passCheck;
  }

  visitValueFunction(val: FunctionValue): boolean {
    let passCheck = this.visitObjectProperties(val);
    if (!passCheck) {
      return false;
    }

    if (val instanceof BoundFunctionValue) {
      passCheck = this.visitValue(val.$BoundTargetFunction);
      if (!passCheck) {
        return false;
      }
      passCheck = this.visitValue(val.$BoundThis);
      if (!passCheck) {
        return false;
      }
      for (let boundArg of val.$BoundArguments) {
        passCheck = this.visitValue(boundArg);
      }
      return passCheck;
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
        unbound: (Object.create(null): any),
        modified: (Object.create(null): any),
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

    let visitedBindings = (Object.create(null): any);
    this._withScope(val, () => {
      invariant(functionInfo);
      for (let innerName in functionInfo.unbound) {
        let visitedBinding;
        let doesNotMatter = true;
        let reference = this.logger.tryQuery(
          () => ResolveBinding(this.realm, innerName, doesNotMatter, val.$Environment),
          undefined,
          false /* The only reason `ResolveBinding` might fail is because the global object is partial. But in that case, we know that we are dealing with the common scope. */
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
      return false;
    });

    this.functionBindings.set(val, visitedBindings);
    // TODO: disable for function temporarily.
    // Investigate further if we need to enable for function.
    return false;
  }

  visitValueObject(val: ObjectValue): boolean {
    let passCheck = this.visitObjectProperties(val);
    if (!passCheck) {
      return false;
    }

    // If this object is a prototype object that was implicitly created by the runtime
    // for a constructor, then we can obtain a reference to this object
    // in a special way that's handled alongside function serialization.
    let constructor = val.originalConstructor;
    if (constructor !== undefined) {
      return this.visitValue(constructor);
    }

    let kind = val.getKind();
    switch (kind) {
      case "RegExp":
      case "Number":
      case "String":
      case "Boolean":
      case "ArrayBuffer":
        return true;
      case "Date":
        let dateValue = val.$DateValue;
        invariant(dateValue !== undefined);
        return this.visitValue(dateValue);
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
        return this.visitValue(buf);
      case "Map":
      case "WeakMap":
        return this.visitValueMap(val);
      case "Set":
      case "WeakSet":
        return this.visitValueSet(val);
      default:
        if (kind !== "Object") this.logger.logError(val, `Object of kind ${kind} is not supported in residual heap.`);
        if (this.$ParameterMap !== undefined)
          this.logger.logError(val, `Arguments object is not supported in residual heap.`);
        return false;
    }
  }

  visitValueSymbol(val: SymbolValue): boolean {
    let passCheck = true;
    if (val.$Description) passCheck = this.visitValue(val.$Description);
    return passCheck;
  }

  visitValueProxy(val: ProxyValue): boolean {
    let passCheck = this.visitValue(val.$ProxyTarget);
    if (!passCheck) {
      return false;
    }
    return this.visitValue(val.$ProxyHandler);
  }

  visitAbstractValue(val: AbstractValue): boolean {
    let passCheck = true;
    if (val.kind === "sentinel member expression")
      this.logger.logError(val, "expressions of type o[p] are not yet supported for partially known o and unknown p");
    for (let i = 0, n = val.args.length; i < n; i++) {
      let retVal;
      [retVal, passCheck] = this.visitEquivalentValue(val.args[i]);
      val.args[i] = retVal;
      if (!passCheck) {
        return false;
      }
    }
    return passCheck;
  }

  _mark(val: Value): boolean {
    let scopes = this.values.get(val);
    if (scopes === undefined) this.values.set(val, (scopes = new Set()));
    if (scopes.has(this.scope)) return false;
    scopes.add(this.scope);
    return true;
  }

  _postProcessValue(val: Value, passCheck: boolean): boolean {
    return true;
  }

  visitEquivalentValue<T: Value>(val: T): [T, boolean] {
    let passCheck = true;
    if (val instanceof AbstractValue) {
      let equivalentValue = this.equivalenceSet.add(val);
      if (this._mark(equivalentValue)) {
        passCheck = this.visitAbstractValue(equivalentValue);
      }
      return [(equivalentValue: any), passCheck];
    }
    passCheck = this.visitValue(val);
    return [val, passCheck];
  }

  // Return true to indicate the value can be lazied.
  visitValue(val: Value): boolean {
    invariant(!val.refuseSerialization);
    let passCheck = true;
    if (val instanceof AbstractValue) {
      if (this._mark(val)) passCheck = this.visitAbstractValue(val);
    } else if (val.isIntrinsic()) {
      // All intrinsic values exist from the beginning of time...
      // ...except for a few that come into existance as templates for abstract objects (TODO #882).
      passCheck = this._withScope(this.commonScope, () => {
        return this._mark(val);
      });
    } else if (val instanceof EmptyValue) {
      passCheck = this._mark(val);
    } else if (ResidualHeapInspector.isLeaf(val)) {
      passCheck = this._mark(val);
    } else if (IsArray(this.realm, val)) {
      invariant(val instanceof ObjectValue);
      if (this._mark(val)) passCheck = this.visitValueArray(val);
    } else if (val instanceof ProxyValue) {
      if (this._mark(val)) passCheck = this.visitValueProxy(val);
    } else if (val instanceof FunctionValue) {
      // Function declarations should get hoisted in common scope so that instances only get allocated once
      passCheck = this._withScope(this.commonScope, () => {
        invariant(val instanceof FunctionValue);
        if (this._mark(val)) {
          return this.visitValueFunction(val);
        }
        return false;
      });
    } else if (val instanceof SymbolValue) {
      if (this._mark(val)) passCheck = this.visitValueSymbol(val);
    } else {
      invariant(val instanceof ObjectValue);

      // Prototypes are reachable via function declarations, and those get hoisted, so we need to move
      // prototype initialization to the common scope code as well.
      if (val.originalConstructor !== undefined) {
        passCheck = this._withScope(this.commonScope, () => {
          invariant(val instanceof ObjectValue);
          if (this._mark(val)) {
            return this.visitValueObject(val);
          }
          return false;
        });
      } else {
        if (this._mark(val)) passCheck = this.visitValueObject(val);
      }
    }
    return this._postProcessValue(val, passCheck);
  }

  visitGlobalBinding(key: string): VisitedBinding {
    let binding = this.globalBindings.get(key);
    if (!binding) {
      let value = this.realm.getGlobalLetBinding(key);
      binding = ({ value, modified: true }: VisitedBinding);
      this.globalBindings.set(key, binding);
    }
    if (binding.value) binding.value = this.visitEquivalentValue(binding.value)[0];
    return binding;
  }

  createGeneratorVisitCallbacks(generator: Generator, commonScope: Scope): VisitEntryCallbacks {
    return {
      visitValues: (values: Array<Value>) => {
        for (let i = 0, n = values.length; i < n; i++) values[i] = this.visitEquivalentValue(values[i])[0];
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
      return true;
    });
  }

  visitAdditionalFunctionEffects() {
    for (let [functionValue, effects] of this.additionalFunctionValuesAndEffects.entries()) {
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
      let visitPropertiesAndBindings = () => {
        for (let propertyBinding of modifiedProperties.keys()) {
          let binding: PropertyBinding = ((propertyBinding: any): PropertyBinding);
          let object = binding.object;
          if (object instanceof ObjectValue && createdObjects.has(object)) continue; // Created Object's binding
          if (object.refuseSerialization) continue; // modification to internal state
          if (object.intrinsicName === "global") continue; // Avoid double-counting
          this.visitObjectProperty(binding);
        }
        // TODO #990: Fix additional functions handing of ModifiedBindings
        // TODO: disable for addtional functions for now.
        // Investigate how we can enable for additional functions feature.
        return false;
      };
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
          return true;
        });
      }
    }
  }

  visitRoots(): void {
    let generator = this.realm.generator;
    invariant(generator);
    this.visitGenerator(generator);
    for (let moduleValue of this.modules.initializedModules.values()) this.visitValue(moduleValue);
    this.realm.evaluateAndRevertInGlobalEnv(this.visitAdditionalFunctionEffects.bind(this));
  }
}
