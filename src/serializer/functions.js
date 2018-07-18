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
  StringValue,
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
import { applyOptimizedReactComponents, optimizeReactComponentTreeRoot } from "../react/optimizing.js";
import { handleReportedSideEffect } from "./utils.js";
import { ShapeInformation } from "../utils/ShapeInformation";
import type { ArgModel } from "../utils/ShapeInformation";
import * as t from "@babel/types";

type AdditionalFunctionEntry = {
  value: ECMAScriptSourceFunctionValue | AbstractValue,
  config?: ReactComponentTreeConfig,
  argModelString?: string,
};

export class Functions {
  constructor(realm: Realm, moduleTracer: ModuleTracer) {
    this.realm = realm;
    this.moduleTracer = moduleTracer;
    this.writeEffects = new Map();
    this.functionExpressions = new Map();
    this._noopFunction = undefined;
  }

  realm: Realm;
  // maps back from FunctionValue to the expression string
  functionExpressions: Map<FunctionValue, string>;
  moduleTracer: ModuleTracer;
  writeEffects: WriteEffects;
  _noopFunction: void | ECMAScriptSourceFunctionValue;

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

  __optimizedFunctionEntryOfValue(value: Value): AdditionalFunctionEntry | void {
    let realm = this.realm;
    // if we conditionally called __optimize, we may have an AbstractValue that is the union of Empty or Undefined and
    // a function/component to optimize
    if (value instanceof AbstractValue) {
      value = this._unwrapAbstract(value);
    }
    invariant(value instanceof ObjectValue);
    let funcValue = Get(realm, value, "funcValue");
    if (funcValue !== realm.intrinsics.undefined) {
      // unwrap from this side
      if (funcValue instanceof AbstractValue) {
        funcValue = this._unwrapAbstract(funcValue);
      }
      // regular case with __optimized with type information
      invariant(funcValue instanceof ECMAScriptSourceFunctionValue);
      let argModelString = Get(realm, value, "argModelString");
      return argModelString instanceof StringValue
        ? { value: funcValue, argModelString: argModelString.value }
        : { value: funcValue };
    } else {
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
    }

    let location = value.expressionLocation
      ? `${value.expressionLocation.start.line}:${value.expressionLocation.start.column} ` +
        `${value.expressionLocation.end.line}:${value.expressionLocation.end.line}`
      : "location unknown";
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

  __generateInitialAdditionalFunctions(globalKey: string): Array<AdditionalFunctionEntry> {
    let recordedAdditionalFunctions: Array<AdditionalFunctionEntry> = [];
    let realm = this.realm;
    let globalRecordedAdditionalFunctionsMap = this.moduleTracer.modules.logger.tryQuery(
      () => Get(realm, realm.$GlobalObject, globalKey),
      realm.intrinsics.undefined
    );
    invariant(globalRecordedAdditionalFunctionsMap instanceof ObjectValue);
    for (let funcId of globalRecordedAdditionalFunctionsMap.getOwnPropertyKeysArray(true)) {
      let property = globalRecordedAdditionalFunctionsMap.properties.get(funcId);
      if (property) {
        let value = property.descriptor && property.descriptor.value;
        invariant(value !== undefined);
        invariant(value instanceof Value);
        let entry = this.__optimizedFunctionEntryOfValue(value);
        if (entry) recordedAdditionalFunctions.push(entry);
      }
    }
    return recordedAdditionalFunctions;
  }

  optimizeReactComponentTreeRoots(statistics: ReactStatistics, environmentRecordIdAfterGlobalCode: number): void {
    let logger = this.moduleTracer.modules.logger;
    let recordedReactRootValues = this.__generateInitialAdditionalFunctions("__reactComponentTrees");
    // Get write effects of the components
    if (this.realm.react.verbose) {
      logger.logInformation(`Evaluating ${recordedReactRootValues.length} React component tree roots...`);
    }
    for (let { value: componentRoot, config } of recordedReactRootValues) {
      invariant(config);
      optimizeReactComponentTreeRoot(
        this.realm,
        componentRoot,
        config,
        this.writeEffects,
        environmentRecordIdAfterGlobalCode,
        logger,
        statistics
      );
    }
    applyOptimizedReactComponents(this.realm, this.writeEffects, environmentRecordIdAfterGlobalCode);
  }

  _callOfFunction(funcValue: FunctionValue, argModelString: void | string): void => Value {
    let call = funcValue.$Call;
    invariant(call);
    let numArgs = funcValue.getLength();
    let args = [];
    let argModel = argModelString !== undefined ? (JSON.parse(argModelString): ArgModel) : undefined;
    invariant(funcValue instanceof ECMAScriptSourceFunctionValue);
    let params = funcValue.$FormalParameters;
    if (numArgs && numArgs > 0 && params) {
      for (let parameterId of params) {
        if (t.isIdentifier(parameterId)) {
          let paramName = ((parameterId: any): BabelNodeIdentifier).name;
          let shape = ShapeInformation.createForArgument(argModel, paramName);
          // Create an AbstractValue similar to __abstract being called
          args.push(
            AbstractValue.createAbstractArgument(
              this.realm,
              paramName,
              funcValue.expressionLocation,
              shape !== undefined ? shape.getAbstractType() : Value,
              shape
            )
          );
        } else {
          this.realm.handleError(
            new CompilerDiagnostic(
              "Non-identifier args to additional functions unsupported",
              funcValue.expressionLocation,
              "PP1005",
              "FatalError"
            )
          );
          throw new FatalError("Non-identifier args to additional functions unsupported");
        }
      }
    }

    let thisArg = AbstractValue.createAbstractArgument(this.realm, "this", funcValue.expressionLocation, ObjectValue);
    return call.bind(this, thisArg, args);
  }

  checkThatFunctionsAreIndependent(environmentRecordIdAfterGlobalCode: number): void {
    let additionalFunctionsToProcess = this.__generateInitialAdditionalFunctions("__optimizedFunctions");
    // When we find declarations of nested optimized functions, we need to apply the parent
    // effects.
    let additionalFunctionStack = [];
    let additionalFunctions = new Set(additionalFunctionsToProcess.map(entry => entry.value));
    let optimizedFunctionsObject = this.moduleTracer.modules.logger.tryQuery(
      () => Get(this.realm, this.realm.$GlobalObject, "__optimizedFunctions"),
      this.realm.intrinsics.undefined
    );
    invariant(optimizedFunctionsObject instanceof ObjectValue);

    // If there's an additional function that delcared functionValue, it must be
    // have already been evaluated for the __optimize call to have happened, so
    // this should always return either the defining additional function or void
    let getDeclaringAdditionalFunction = functionValue => {
      for (let [additionalFunctionValue, additionalEffects] of this.writeEffects) {
        // CreatedObjects is all objects created by this additional function but not
        // nested additional functions.
        let createdObjects = additionalEffects.effects.createdObjects;
        if (createdObjects.has(functionValue)) return additionalFunctionValue;
      }
    };

    let optimizedFunctionId = 0;
    let getEffectsFromAdditionalFunctionAndNestedFunctions = (functionValue, argModelString) => {
      let currentOptimizedFunctionId = optimizedFunctionId++;
      additionalFunctionStack.push(functionValue);
      invariant(functionValue instanceof ECMAScriptSourceFunctionValue);
      let logCompilerDiagnostic = (msg: string) => {
        let error = new CompilerDiagnostic(msg, undefined, "PP1007", "Warning");
        realm.handleError(error);
      };
      for (let t1 of this.realm.tracers) t1.beginOptimizingFunction(currentOptimizedFunctionId, functionValue);
      let call = this._callOfFunction(functionValue, argModelString);
      let realm = this.realm;
      let effects: Effects = realm.evaluatePure(
        () => realm.evaluateForEffectsInGlobalEnv(call, undefined, "additional function"),
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
        getDeclaringAdditionalFunction(functionValue)
      );
      invariant(additionalFunctionEffects);
      effects = additionalFunctionEffects.effects;
      this.writeEffects.set(functionValue, additionalFunctionEffects);

      // look for newly registered optimized functions
      let modifiedProperties = additionalFunctionEffects.effects.modifiedProperties;
      // Conceptually this will ensure that the nested additional function is defined
      // although for later cases, we'll apply the effects of the parents only.
      this.realm.withEffectsAppliedInGlobalEnv(() => {
        for (let [propertyBinding] of modifiedProperties) {
          let descriptor = propertyBinding.descriptor;
          if (descriptor && propertyBinding.object === optimizedFunctionsObject) {
            let newValue = descriptor.value;
            invariant(newValue instanceof Value); //todo: this does not seem invariantly true
            let newEntry = this.__optimizedFunctionEntryOfValue(newValue);
            if (newEntry) {
              additionalFunctions.add(newEntry.value);
              getEffectsFromAdditionalFunctionAndNestedFunctions(newEntry.value, newEntry.argModelString);
              // Now we have to rember the stack of effects that need to be applied to deal with
              // this additional function.
            }
          }
        }
        return null;
      }, additionalFunctionEffects.effects);
      invariant(additionalFunctionStack.pop() === functionValue);
      for (let t2 of this.realm.tracers) t2.endOptimizingFunction(currentOptimizedFunctionId);
    };

    while (additionalFunctionsToProcess.length > 0) {
      let funcObject = additionalFunctionsToProcess.shift();
      getEffectsFromAdditionalFunctionAndNestedFunctions(funcObject.value, funcObject.argModelString);
    }
    invariant(additionalFunctionStack.length === 0);

    // check that functions are independent
    let conflicts: Map<BabelNodeSourceLocation, CompilerDiagnostic> = new Map();
    for (let fun1 of additionalFunctions) {
      invariant(fun1 instanceof FunctionValue);
      let fun1Name = this.functionExpressions.get(fun1) || fun1.intrinsicName || "(unknown function)";
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
        let reportFn = () => {
          this.reportWriteConflicts(fun1Name, conflicts, e1.modifiedProperties, this._callOfFunction(fun2));
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
    fname: string,
    conflicts: Map<BabelNodeSourceLocation, CompilerDiagnostic>,
    pbs: PropertyBindings,
    call2: void => Value
  ): void {
    let reportConflict = (location: BabelNodeSourceLocation) => {
      let error = new CompilerDiagnostic(
        `Property access conflicts with write in optimized function ${fname}`,
        location,
        "PP1003",
        "FatalError"
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
      if (writtenObjects.has(ob) && !conflicts.has(location)) reportConflict(location);
    };
    let oldReportPropertyAccess = this.realm.reportPropertyAccess;
    this.realm.reportPropertyAccess = (pb: PropertyBinding) => {
      if (pb.object.refuseSerialization) return;
      let location = this.realm.currentLocation;
      if (!location) return; // happens only when accessing an additional function property
      if (pbs.has(pb) && !conflicts.has(location)) reportConflict(location);
    };
    try {
      ignoreErrorsIn(this.realm, () => this.realm.evaluateForEffectsInGlobalEnv(call2));
    } finally {
      this.realm.reportPropertyAccess = oldReportPropertyAccess;
      this.realm.reportObjectGetOwnProperties = oldReportObjectGetOwnProperties;
    }
  }
}
