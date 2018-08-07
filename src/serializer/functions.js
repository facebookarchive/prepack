/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { BabelNodeSourceLocation } from "@babel/types";
import { Completion, PossiblyNormalCompletion } from "../completions.js";
import { CompilerDiagnostic, FatalError } from "../errors.js";
import invariant from "../invariant.js";
import { type Effects, type PropertyBindings, Realm } from "../realm.js";
import type { PropertyBinding, ReactComponentTreeConfig } from "../types.js";
import { ignoreErrorsIn } from "../utils/errors.js";
import {
  AbstractObjectValue,
  AbstractValue,
  ECMAScriptSourceFunctionValue,
  FunctionValue,
  ObjectValue,
  UndefinedValue,
  EmptyValue,
  Value,
} from "../values/index.js";
import { Get } from "../methods/index.js";
import { ModuleTracer } from "../utils/modules.js";
import { createAdditionalEffects } from "./utils.js";
import { ReactStatistics } from "./types";
import type { AdditionalFunctionEffects, WriteEffects } from "./types";
import { convertConfigObjectToReactComponentTreeConfig, valueIsKnownReactAbstraction } from "../react/utils.js";
import { optimizeReactComponentTreeRoot } from "../react/optimizing.js";
import { handleReportedSideEffect } from "./utils.js";
import type { ArgModel } from "../types.js";
import { optionalStringOfLocation } from "../utils/babelhelpers";
import { Properties, Utils } from "../singletons.js";

type AdditionalFunctionEntry = {
  value: ECMAScriptSourceFunctionValue | AbstractValue,
  config?: ReactComponentTreeConfig,
  argModel?: ArgModel,
};

export class Functions {
  constructor(realm: Realm, moduleTracer: ModuleTracer) {
    this.realm = realm;
    this.moduleTracer = moduleTracer;
    this.writeEffects = new Map();
    this._noopFunction = undefined;
    this._optimizedFunctionId = 0;
  }

  realm: Realm;
  // maps back from FunctionValue to the expression string
  moduleTracer: ModuleTracer;
  writeEffects: WriteEffects;
  _noopFunction: void | ECMAScriptSourceFunctionValue;
  _optimizedFunctionId: number;

  _unwrapAbstract(value: AbstractValue): Value {
    let elements = value.values.getElements();
    if (elements) {
      let possibleValues = [...elements].filter(
        element => !(element instanceof EmptyValue || element instanceof UndefinedValue)
      );
      if (possibleValues.length === 1) {
        return possibleValues[0];
      }
    }
    return value;
  }

  _optimizedFunctionEntryOfValue(value: Value): AdditionalFunctionEntry | void {
    let realm = this.realm;
    // if we conditionally called __optimize, we may have an AbstractValue that is the union of Empty or Undefined and
    // a function/component to optimize
    if (value instanceof AbstractValue) {
      value = this._unwrapAbstract(value);
    }
    invariant(value instanceof ObjectValue);
    // React component tree logic
    let config = Get(realm, value, "config");
    let rootComponent = Get(realm, value, "rootComponent");
    let validConfig = config instanceof ObjectValue || config === realm.intrinsics.undefined;
    let validRootComponent =
      rootComponent instanceof ECMAScriptSourceFunctionValue ||
      (rootComponent instanceof AbstractValue && valueIsKnownReactAbstraction(this.realm, rootComponent));

    if (validConfig && validRootComponent) {
      return {
        value: ((rootComponent: any): AbstractValue | ECMAScriptSourceFunctionValue),
        config: convertConfigObjectToReactComponentTreeConfig(realm, ((config: any): ObjectValue | UndefinedValue)),
      };
    }

    let location = optionalStringOfLocation(value.expressionLocation);
    realm.handleError(
      new CompilerDiagnostic(
        `Optimized Function Value ${location} is an not a function or react element`,
        realm.currentLocation,
        "PP0033",
        "FatalError"
      )
    );
    throw new FatalError("Optimized Function Values must be functions or react elements");
  }

  _generateInitialAdditionalFunctions(globalKey: string): Array<AdditionalFunctionEntry> {
    let recordedAdditionalFunctions: Array<AdditionalFunctionEntry> = [];
    let realm = this.realm;
    let globalRecordedAdditionalFunctionsMap = this.moduleTracer.modules.logger.tryQuery(
      () => Get(realm, realm.$GlobalObject, globalKey),
      realm.intrinsics.undefined
    );
    invariant(globalRecordedAdditionalFunctionsMap instanceof ObjectValue);
    for (let funcId of Properties.GetOwnPropertyKeysArray(realm, globalRecordedAdditionalFunctionsMap, true, false)) {
      let property = globalRecordedAdditionalFunctionsMap.properties.get(funcId);
      if (property) {
        let value = property.descriptor && property.descriptor.value;
        invariant(value !== undefined);
        invariant(value instanceof Value);
        let entry = this._optimizedFunctionEntryOfValue(value);
        if (entry) recordedAdditionalFunctions.push(entry);
      }
    }
    return recordedAdditionalFunctions;
  }

  _generateOptimizedFunctionsFromRealm(): Array<AdditionalFunctionEntry> {
    let realm = this.realm;
    let recordedAdditionalFunctions = [];
    for (let [valueToOptimize, argModel] of realm.optimizedFunctions) {
      let value = valueToOptimize instanceof AbstractValue ? this._unwrapAbstract(valueToOptimize) : valueToOptimize;
      invariant(value instanceof ECMAScriptSourceFunctionValue);
      // Check for case where __optimize was called in speculative context where effects were discarded
      if (!value.isValid()) {
        let error = new CompilerDiagnostic(
          "Called __optimize on function in failed speculative context",
          value.expressionLocation,
          "PP1008",
          "RecoverableError"
        );
        if (realm.handleError(error) !== "Recover") throw new FatalError();
      } else {
        recordedAdditionalFunctions.push({ value, argModel });
      }
    }
    return recordedAdditionalFunctions;
  }

  optimizeReactComponentTreeRoots(statistics: ReactStatistics, environmentRecordIdAfterGlobalCode: number): void {
    let logger = this.moduleTracer.modules.logger;
    let recordedReactRootValues = this._generateInitialAdditionalFunctions("__reactComponentTrees");
    // Get write effects of the components
    if (this.realm.react.verbose) {
      logger.logInformation(`Evaluating ${recordedReactRootValues.length} React component tree roots...`);
    }
    let alreadyEvaluated = new Map();
    for (let { value: componentRoot, config } of recordedReactRootValues) {
      invariant(config);
      optimizeReactComponentTreeRoot(
        this.realm,
        componentRoot,
        config,
        this.writeEffects,
        environmentRecordIdAfterGlobalCode,
        logger,
        statistics,
        alreadyEvaluated
      );
    }
  }

  getDeclaringOptimizedFunction(functionValue: ECMAScriptSourceFunctionValue) {
    for (let [optimizedFunctionValue, additionalEffects] of this.writeEffects) {
      // CreatedObjects is all objects created by this optimized function but not
      // nested optimized functions.
      let createdObjects = additionalEffects.effects.createdObjects;
      if (createdObjects.has(functionValue)) return optimizedFunctionValue;
    }
  }

  processCollectedNestedOptimizedFunctions(environmentRecordIdAfterGlobalCode: number): void {
    for (let [functionValue, effects] of this.realm.collectedNestedOptimizedFunctionEffects) {
      let additionalFunctionEffects = createAdditionalEffects(
        this.realm,
        effects,
        true,
        "AdditionalFunctionEffects",
        environmentRecordIdAfterGlobalCode,
        this.getDeclaringOptimizedFunction(functionValue)
      );
      invariant(additionalFunctionEffects !== null);
      this.writeEffects.set(functionValue, additionalFunctionEffects);
    }
  }

  _withEmptyOptimizedFunctionList(
    { value, argModel }: AdditionalFunctionEntry,
    func: (ECMAScriptSourceFunctionValue, ArgModel | void) => void
  ): void {
    let oldRealmOptimizedFunctions = this.realm.optimizedFunctions;
    this.realm.optimizedFunctions = new Map();
    let currentOptimizedFunctionId = this._optimizedFunctionId++;
    invariant(value instanceof ECMAScriptSourceFunctionValue);
    for (let t1 of this.realm.tracers) t1.beginOptimizingFunction(currentOptimizedFunctionId, value);
    func(value, argModel);
    for (let t2 of this.realm.tracers) t2.endOptimizingFunction(currentOptimizedFunctionId);
    for (let [oldValue, model] of oldRealmOptimizedFunctions) this.realm.optimizedFunctions.set(oldValue, model);
  }

  checkThatFunctionsAreIndependent(environmentRecordIdAfterGlobalCode: number): void {
    let additionalFunctionsToProcess = this._generateOptimizedFunctionsFromRealm();
    // When we find declarations of nested optimized functions, we need to apply the parent
    // effects.
    let additionalFunctionStack = [];
    let additionalFunctions = new Set(additionalFunctionsToProcess.map(entry => entry.value));

    let recordWriteEffectsForOptimizedFunctionAndNestedFunctions = (
      functionValue: ECMAScriptSourceFunctionValue,
      argModel: ArgModel | void
    ) => {
      additionalFunctionStack.push(functionValue);
      let call = Utils.createModelledFunctionCall(this.realm, functionValue, argModel);
      let realm = this.realm;

      let logCompilerDiagnostic = (msg: string) => {
        let error = new CompilerDiagnostic(msg, undefined, "PP1007", "Warning");
        realm.handleError(error);
      };
      let effects: Effects = realm.evaluatePure(
        () => realm.evaluateForEffectsInGlobalEnv(call, undefined, "additional function"),
        /*bubbles*/ true,
        (sideEffectType, binding, expressionLocation) =>
          handleReportedSideEffect(logCompilerDiagnostic, sideEffectType, binding, expressionLocation)
      );
      invariant(effects);
      let additionalFunctionEffects = createAdditionalEffects(
        this.realm,
        effects,
        true,
        "AdditionalFunctionEffects",
        environmentRecordIdAfterGlobalCode,
        this.getDeclaringOptimizedFunction(functionValue)
      );
      invariant(additionalFunctionEffects);
      effects = additionalFunctionEffects.effects;
      if (this.writeEffects.has(functionValue)) {
        let error = new CompilerDiagnostic(
          "Trying to optimize a function with two parent optimized functions, which is not currently allowed.",
          functionValue.expressionLocation,
          "PP1009",
          "FatalError"
        );
        if (realm.handleError(error) !== "Recover") throw new FatalError();
      }
      this.writeEffects.set(functionValue, additionalFunctionEffects);

      // Conceptually this will ensure that the nested additional function is defined
      // although for later cases, we'll apply the effects of the parents only.
      this.realm.withEffectsAppliedInGlobalEnv(() => {
        let newOptFuncs = this._generateOptimizedFunctionsFromRealm();
        for (let newEntry of newOptFuncs) {
          additionalFunctions.add(newEntry.value);
          this._withEmptyOptimizedFunctionList(newEntry, recordWriteEffectsForOptimizedFunctionAndNestedFunctions);
        }
        // Now we have to remember the stack of effects that need to be applied to deal with
        // this additional function.
        return null;
      }, additionalFunctionEffects.effects);
      invariant(additionalFunctionStack.pop() === functionValue);
    };

    for (let funcObject of additionalFunctionsToProcess) {
      this._withEmptyOptimizedFunctionList(funcObject, recordWriteEffectsForOptimizedFunctionAndNestedFunctions);
    }
    invariant(additionalFunctionStack.length === 0);

    // check that functions are independent
    let conflicts: Map<BabelNodeSourceLocation, CompilerDiagnostic> = new Map();
    for (let fun1 of additionalFunctions) {
      invariant(fun1 instanceof FunctionValue);
      let fun1Location = fun1.expressionLocation;
      let fun1Name = fun1.getDebugName() || optionalStringOfLocation(fun1Location);
      // Also do argument validation here
      let additionalFunctionEffects = this.writeEffects.get(fun1);
      invariant(additionalFunctionEffects !== undefined);
      let e1 = additionalFunctionEffects.effects;
      invariant(e1 !== undefined);
      if (e1.result instanceof Completion && !e1.result instanceof PossiblyNormalCompletion) {
        let error = new CompilerDiagnostic(
          `Additional function ${fun1Name} may terminate abruptly`,
          e1.result.location,
          "PP1002",
          "FatalError"
        );
        this.realm.handleError(error);
        throw new FatalError();
      }
      for (let fun2 of additionalFunctions) {
        if (fun1 === fun2) continue;
        invariant(fun2 instanceof FunctionValue);
        let fun2Location = fun2.expressionLocation;
        let fun2Name = fun2.getDebugName() || optionalStringOfLocation(fun2Location);
        let reportFn = () => {
          this.reportWriteConflicts(
            fun1Name,
            fun2Name,
            conflicts,
            e1.modifiedProperties,
            Utils.createModelledFunctionCall(this.realm, fun2)
          );
          return null;
        };
        let fun2Effects = this.writeEffects.get(fun2);
        invariant(fun2Effects);
        if (fun2Effects.parentAdditionalFunction) {
          let parentEffects = this.writeEffects.get(fun2Effects.parentAdditionalFunction);
          invariant(parentEffects);
          this.realm.withEffectsAppliedInGlobalEnv(reportFn, parentEffects.effects);
        } else {
          reportFn();
        }
      }
    }
    if (conflicts.size > 0) {
      for (let diagnostic of conflicts.values()) this.realm.handleError(diagnostic);
      throw new FatalError();
    }
  }

  getAdditionalFunctionValuesToEffects(): Map<FunctionValue, AdditionalFunctionEffects> {
    return this.writeEffects;
  }

  reportWriteConflicts(
    f1name: string,
    f2name: string,
    conflicts: Map<BabelNodeSourceLocation, CompilerDiagnostic>,
    pbs: PropertyBindings,
    call2: void => Value
  ): void {
    let reportConflict = (
      location: BabelNodeSourceLocation,
      object: string = "",
      key?: string,
      originalLocation: BabelNodeSourceLocation | void | null
    ) => {
      let firstLocationString = optionalStringOfLocation(originalLocation);
      let secondLocationString = optionalStringOfLocation(location);
      let propString = key ? ` "${key}"` : "";
      let objectString = object ? ` on object "${object}" ` : "";
      if (!objectString && key) objectString = " on <unnamed object> ";
      let error = new CompilerDiagnostic(
        `Write to property${propString}${objectString}at optimized function ${f1name}${firstLocationString} conflicts with access in function ${f2name}${secondLocationString}`,
        location,
        "PP1003",
        "RecoverableError"
      );
      conflicts.set(location, error);
    };
    let writtenObjects: Set<ObjectValue | AbstractObjectValue> = new Set();
    pbs.forEach((val, key, m) => {
      writtenObjects.add(key.object);
    });
    let oldReportObjectGetOwnProperties = this.realm.reportObjectGetOwnProperties;
    this.realm.reportObjectGetOwnProperties = (ob: ObjectValue) => {
      let location = this.realm.currentLocation;
      invariant(location);
      if (writtenObjects.has(ob) && !conflicts.has(location))
        reportConflict(location, ob.getDebugName(), undefined, ob.expressionLocation);
    };
    let oldReportPropertyAccess = this.realm.reportPropertyAccess;
    this.realm.reportPropertyAccess = (pb: PropertyBinding) => {
      if (ObjectValue.refuseSerializationOnPropertyBinding(pb)) return;
      let location = this.realm.currentLocation;
      if (!location) return; // happens only when accessing an additional function property
      if (pbs.has(pb) && !conflicts.has(location)) {
        let originalLocation =
          pb.descriptor && pb.descriptor.value && !Array.isArray(pb.descriptor.value)
            ? pb.descriptor.value.expressionLocation
            : undefined;
        let keyString = pb.key instanceof Value ? pb.key.toDisplayString() : pb.key;
        reportConflict(location, pb.object ? pb.object.getDebugName() : undefined, keyString, originalLocation);
      }
    };
    try {
      ignoreErrorsIn(this.realm, () => this.realm.evaluateForEffectsInGlobalEnv(call2));
    } finally {
      this.realm.reportPropertyAccess = oldReportPropertyAccess;
      this.realm.reportObjectGetOwnProperties = oldReportObjectGetOwnProperties;
    }
  }
}
