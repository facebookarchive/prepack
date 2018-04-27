/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { BabelNodeSourceLocation } from "babel-types";
import { Completion, JoinedAbruptCompletions, PossiblyNormalCompletion, ReturnCompletion } from "../completions.js";
import { CompilerDiagnostic, FatalError } from "../errors.js";
import invariant from "../invariant.js";
import { construct_empty_effects, type Effects, type PropertyBindings, Realm } from "../realm.js";
import type { Binding } from "../environment.js";
import type { PropertyBinding, ReactComponentTreeConfig, FunctionBodyAstNode } from "../types.js";
import { ignoreErrorsIn } from "../utils/errors.js";
import {
  Value,
  AbstractObjectValue,
  FunctionValue,
  ObjectValue,
  AbstractValue,
  ECMAScriptSourceFunctionValue,
  UndefinedValue,
  BoundFunctionValue,
} from "../values/index.js";
import { Generator } from "../utils/generator.js";
import { Get } from "../methods/index.js";
import { ModuleTracer } from "../utils/modules.js";
import { Join, Properties } from "../singletons.js";
import { ReactStatistics } from "./types";
import type { ReactSerializerState, AdditionalFunctionEffects, ReactEvaluatedNode } from "./types";
import { Reconciler, type ComponentTreeState } from "../react/reconcilation.js";
import {
  valueIsClassComponent,
  convertSimpleClassComponentToFunctionalComponent,
  convertFunctionalComponentToComplexClassComponent,
  normalizeFunctionalComponentParamaters,
  getComponentTypeFromRootValue,
  valueIsKnownReactAbstraction,
  createReactEvaluatedNode,
  getComponentName,
  convertConfigObjectToReactComponentTreeConfig,
} from "../react/utils.js";
import * as t from "babel-types";

type AdditionalFunctionEntry = {
  value: ECMAScriptSourceFunctionValue | AbstractValue,
  config?: ReactComponentTreeConfig,
};

export class Functions {
  constructor(realm: Realm, moduleTracer: ModuleTracer) {
    this.realm = realm;
    this.moduleTracer = moduleTracer;
    this.writeEffects = new Map();
    this.functionExpressions = new Map();
    this._noOpFunction = undefined;
  }

  realm: Realm;
  // maps back from FunctionValue to the expression string
  functionExpressions: Map<FunctionValue, string>;
  moduleTracer: ModuleTracer;
  writeEffects: Map<FunctionValue, AdditionalFunctionEffects>;
  _noOpFunction: void | ECMAScriptSourceFunctionValue;

  __optimizedFunctionEntryOfValue(value: Value): AdditionalFunctionEntry | void {
    let realm = this.realm;
    if (value instanceof ECMAScriptSourceFunctionValue) {
      // additional function logic
      return { value };
    } else if (value instanceof ObjectValue) {
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
        undefined,
        "PP0033",
        "FatalError"
      )
    );
    throw new FatalError("Optimized Function Values must be functions or react elements");
  }

  __generateInitialAdditionalFunctions(globalKey: string) {
    let recordedAdditionalFunctions: Array<AdditionalFunctionEntry> = [];
    let realm = this.realm;
    let globalRecordedAdditionalFunctionsMap = this.moduleTracer.modules.logger.tryQuery(
      () => Get(realm, realm.$GlobalObject, globalKey),
      realm.intrinsics.undefined
    );
    invariant(globalRecordedAdditionalFunctionsMap instanceof ObjectValue);
    for (let funcId of globalRecordedAdditionalFunctionsMap.getOwnPropertyKeysArray()) {
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

  // NB: effects that are returned may be different than the effects passed in, so after this call, you may no longer
  // use the effects object you passed into this function.
  _createAdditionalEffects(
    effects: Effects,
    fatalOnAbrupt: boolean,
    name: string,
    environmentRecordIdAfterGlobalCode: number,
    parentAdditionalFunction: FunctionValue | void = undefined
  ): AdditionalFunctionEffects | null {
    let realm = this.realm;
    let [result, generator] = effects.data;
    if (result instanceof PossiblyNormalCompletion || result instanceof JoinedAbruptCompletions) {
      // joined generators have joined entries that will get visited recursively via result, so get rid of them here
      generator.purgeEntriesWithGeneratorDepencies();
      // The completion is not the end of function execution, but a fork point for separate threads of control.
      // The effects of all of these threads need to get joined up and rolled into the top level effects,
      // so that applying the effects before serializing the body will fully initialize all variables and objects.
      effects = realm.evaluateForEffects(
        () => {
          realm.applyEffects(effects, "_createAdditionalEffects/1", true);
          if (result instanceof PossiblyNormalCompletion) {
            result = Join.joinPossiblyNormalCompletionWithAbruptCompletion(
              realm,
              result,
              new ReturnCompletion(result.value),
              construct_empty_effects(realm)
            ).result;
          }
          invariant(result instanceof JoinedAbruptCompletions);
          let completionEffects = Join.joinNestedEffects(realm, result);
          realm.applyEffects(completionEffects, "_createAdditionalEffects/2", false);
          return result;
        },
        undefined,
        "_createAdditionalEffects"
      );
    }
    let retValue: AdditionalFunctionEffects = {
      parentAdditionalFunction,
      effects,
      transforms: [],
      generator: Generator.fromEffects(effects, this.realm, name, environmentRecordIdAfterGlobalCode),
      additionalRoots: new Set(),
    };
    return retValue;
  }

  _generateWriteEffectsForReactComponentTree(
    componentType: ECMAScriptSourceFunctionValue,
    effects: Effects,
    componentTreeState: ComponentTreeState,
    evaluatedNode: ReactEvaluatedNode,
    environmentRecordIdAfterGlobalCode: number
  ): void {
    let additionalFunctionEffects = this._createAdditionalEffects(
      effects,
      false,
      "ReactAdditionalFunctionEffects",
      environmentRecordIdAfterGlobalCode
    );
    if (additionalFunctionEffects === null) {
      // TODO we don't support this yet, but will do very soon
      // to unblock work, we'll just return at this point right now
      evaluatedNode.status = "UNSUPPORTED_COMPLETION";
      return;
    }
    effects = additionalFunctionEffects.effects;
    let value = effects.result;

    if (value === this.realm.intrinsics.undefined) {
      // if we get undefined, then this component tree failed and a message was already logged
      // in the reconciler
      return;
    }
    if (valueIsClassComponent(this.realm, componentType)) {
      if (componentTreeState.status === "SIMPLE") {
        // if the root component was a class and is now simple, we can convert it from a class
        // component to a functional component
        convertSimpleClassComponentToFunctionalComponent(this.realm, componentType, additionalFunctionEffects);
        normalizeFunctionalComponentParamaters(componentType);
        this.writeEffects.set(componentType, additionalFunctionEffects);
      } else {
        let prototype = Get(this.realm, componentType, "prototype");
        invariant(prototype instanceof ObjectValue);
        let renderMethod = Get(this.realm, prototype, "render");
        invariant(renderMethod instanceof ECMAScriptSourceFunctionValue);
        this.writeEffects.set(renderMethod, additionalFunctionEffects);
      }
    } else {
      if (componentTreeState.status === "COMPLEX") {
        convertFunctionalComponentToComplexClassComponent(
          this.realm,
          componentType,
          componentTreeState.componentType,
          additionalFunctionEffects
        );
        let prototype = Get(this.realm, componentType, "prototype");
        invariant(prototype instanceof ObjectValue);
        let renderMethod = Get(this.realm, prototype, "render");
        invariant(renderMethod instanceof ECMAScriptSourceFunctionValue);
        this.writeEffects.set(renderMethod, additionalFunctionEffects);
      } else {
        normalizeFunctionalComponentParamaters(componentType);
        this.writeEffects.set(componentType, additionalFunctionEffects);
      }
    }
    // apply contextTypes for legacy context
    if (componentTreeState.contextTypes.size > 0) {
      let contextTypes = new ObjectValue(this.realm, this.realm.intrinsics.ObjectPrototype);
      let noOpFunc = this._getNoOpFunction();
      for (let key of componentTreeState.contextTypes) {
        Properties.Set(this.realm, contextTypes, key, noOpFunc, true);
      }
      Properties.Set(this.realm, componentType, "contextTypes", contextTypes, true);
    }
  }

  _getNoOpFunction(): ECMAScriptSourceFunctionValue {
    if (this._noOpFunction) {
      return this._noOpFunction;
    }
    let noOpFunc = new ECMAScriptSourceFunctionValue(this.realm);
    let body = t.blockStatement([]);
    ((body: any): FunctionBodyAstNode).uniqueOrderedTag = this.realm.functionBodyUniqueTagSeed++;
    noOpFunc.$FormalParameters = [];
    noOpFunc.$ECMAScriptCode = body;
    this._noOpFunction = noOpFunc;
    return noOpFunc;
  }

  _hasWriteConflictsFromReactRenders(
    bindings: Set<Binding>,
    effects: Effects,
    nestedEffects: Array<Effects>,
    evaluatedNode: ReactEvaluatedNode
  ): boolean {
    let recentBindings = effects.modifiedBindings;
    let ignoreBindings = new Set();
    let failed = false;

    for (let nestedEffect of nestedEffects) {
      let nestedBindingsToIgnore = nestedEffect.modifiedBindings;
      for (let [binding] of nestedBindingsToIgnore) {
        ignoreBindings.add(binding);
      }
    }

    for (let [binding] of recentBindings) {
      if (bindings.has(binding) && !ignoreBindings.has(binding)) {
        failed = true;
      }
      bindings.add(binding);
    }
    if (failed) {
      evaluatedNode.status = "WRITE-CONFLICTS";
    }
    return failed;
  }

  optimizeReactComponentTreeRoots(
    statistics: ReactStatistics,
    react: ReactSerializerState,
    environmentRecordIdAfterGlobalCode: number
  ): void {
    let logger = this.moduleTracer.modules.logger;
    let bindings = new Set();
    let recordedReactRootValues = this.__generateInitialAdditionalFunctions("__reactComponentTrees");
    // Get write effects of the components
    if (this.realm.react.verbose) {
      logger.logInformation(`Evaluating ${recordedReactRootValues.length} React component tree roots...`);
    }
    for (let { value: componentRoot, config } of recordedReactRootValues) {
      invariant(config);
      let reconciler = new Reconciler(this.realm, this.moduleTracer.modules.logger, statistics, react, config);
      let componentType = getComponentTypeFromRootValue(this.realm, componentRoot);
      if (componentType === null) {
        continue;
      }
      let evaluatedRootNode = createReactEvaluatedNode("ROOT", getComponentName(this.realm, componentType));
      statistics.evaluatedRootNodes.push(evaluatedRootNode);
      if (reconciler.hasEvaluatedRootNode(componentType, evaluatedRootNode)) {
        continue;
      }
      let componentTreeEffects = reconciler.renderReactComponentTree(componentType, null, null, evaluatedRootNode);
      if (componentTreeEffects === null) {
        if (this.realm.react.verbose) {
          logger.logInformation(`  ✖ ${evaluatedRootNode.name} (root)`);
        }
        continue;
      }
      if (this._hasWriteConflictsFromReactRenders(bindings, componentTreeEffects, [], evaluatedRootNode)) {
        if (this.realm.react.verbose) {
          logger.logInformation(`  ✖ ${evaluatedRootNode.name} (root - write conflicts)`);
        }
        continue;
      }
      if (this.realm.react.verbose) {
        logger.logInformation(`  ✔ ${evaluatedRootNode.name} (root)`);
      }

      this._generateWriteEffectsForReactComponentTree(
        componentType,
        componentTreeEffects,
        reconciler.componentTreeState,
        evaluatedRootNode,
        environmentRecordIdAfterGlobalCode
      );

      let startingComponentTreeBranches = 0;
      do {
        startingComponentTreeBranches = reconciler.branchedComponentTrees.length;
        this._optimizeReactComponentTreeBranches(reconciler, bindings, environmentRecordIdAfterGlobalCode);
        this._optimizeReactNestedClosures(reconciler, bindings, environmentRecordIdAfterGlobalCode);
      } while (startingComponentTreeBranches !== reconciler.branchedComponentTrees.length);
    }
  }

  _optimizeReactNestedClosures(
    reconciler: Reconciler,
    bindings: Set<Binding>,
    environmentRecordIdAfterGlobalCode: number
  ): void {
    let logger = this.moduleTracer.modules.logger;

    if (this.realm.react.verbose && reconciler.nestedOptimizedClosures.length > 0) {
      logger.logInformation(`  Evaluating nested closures...`);
    }
    for (let {
      func,
      evaluatedNode,
      nestedEffects,
      componentType,
      context,
      branchState,
    } of reconciler.nestedOptimizedClosures) {
      if (reconciler.hasEvaluatedNestedClosure(func)) {
        continue;
      }
      if (func instanceof ECMAScriptSourceFunctionValue && reconciler.hasEvaluatedRootNode(func, evaluatedNode)) {
        continue;
      }
      let closureEffects = reconciler.renderNestedOptimizedClosure(
        func,
        nestedEffects,
        componentType,
        context,
        branchState,
        evaluatedNode
      );
      if (closureEffects === null) {
        if (this.realm.react.verbose) {
          logger.logInformation(`    ✖ function "${getComponentName(this.realm, func)}"`);
        }
        continue;
      }
      if (this._hasWriteConflictsFromReactRenders(bindings, closureEffects, nestedEffects, evaluatedNode)) {
        if (this.realm.react.verbose) {
          logger.logInformation(`    ✖ function "${getComponentName(this.realm, func)}" (write conflicts)`);
        }
        continue;
      }
      if (this.realm.react.verbose) {
        logger.logInformation(`    ✔ function "${getComponentName(this.realm, func)}"`);
      }
      let additionalFunctionEffects = this._createAdditionalEffects(
        closureEffects,
        true,
        "ReactNestedAdditionalFunctionEffects",
        environmentRecordIdAfterGlobalCode
      );
      invariant(additionalFunctionEffects);
      if (func instanceof BoundFunctionValue) {
        invariant(func.$BoundTargetFunction instanceof ECMAScriptSourceFunctionValue);
        this.writeEffects.set(func.$BoundTargetFunction, additionalFunctionEffects);
      } else {
        this.writeEffects.set(func, additionalFunctionEffects);
      }
    }
  }

  _optimizeReactComponentTreeBranches(
    reconciler: Reconciler,
    bindings: Set<Binding>,
    environmentRecordIdAfterGlobalCode: number
  ): void {
    let logger = this.moduleTracer.modules.logger;

    if (this.realm.react.verbose && reconciler.branchedComponentTrees.length > 0) {
      logger.logInformation(`  Evaluating React component tree branches...`);
    }
    // for now we just use abstract props/context, in the future we'll create a new branch with a new component
    // that used the props/context. It will extend the original component and only have a render method
    for (let { rootValue: branchRootValue, evaluatedNode } of reconciler.branchedComponentTrees) {
      let branchComponentType = getComponentTypeFromRootValue(this.realm, branchRootValue);
      if (branchComponentType === null) {
        evaluatedNode.status = "UNKNOWN_TYPE";
        continue;
      }
      // so we don't process the same component multiple times (we might change this logic later)
      if (reconciler.hasEvaluatedRootNode(branchComponentType, evaluatedNode)) {
        continue;
      }
      reconciler.clearComponentTreeState();
      let branchEffects = reconciler.renderReactComponentTree(branchComponentType, null, null, evaluatedNode);
      if (branchEffects === null) {
        if (this.realm.react.verbose) {
          logger.logInformation(`    ✖ ${evaluatedNode.name} (branch)`);
        }
        continue;
      }
      if (this._hasWriteConflictsFromReactRenders(bindings, branchEffects, [], evaluatedNode)) {
        if (this.realm.react.verbose) {
          logger.logInformation(`    ✖ ${evaluatedNode.name} (branch - write conflicts)`);
        }
        continue;
      }
      if (this.realm.react.verbose) {
        logger.logInformation(`    ✔ ${evaluatedNode.name} (branch)`);
      }
      let branchComponentTreeState = reconciler.componentTreeState;
      this._generateWriteEffectsForReactComponentTree(
        branchComponentType,
        branchEffects,
        branchComponentTreeState,
        evaluatedNode,
        environmentRecordIdAfterGlobalCode
      );
    }
  }

  _callOfFunction(funcValue: FunctionValue): void => Value {
    let call = funcValue.$Call;
    invariant(call);
    let numArgs = funcValue.getLength();
    let args = [];
    invariant(funcValue instanceof ECMAScriptSourceFunctionValue);
    let params = funcValue.$FormalParameters;
    if (numArgs && numArgs > 0 && params) {
      for (let parameterId of params) {
        if (t.isIdentifier(parameterId)) {
          // Create an AbstractValue similar to __abstract being called
          args.push(
            AbstractValue.createAbstractArgument(
              this.realm,
              ((parameterId: any): BabelNodeIdentifier).name,
              funcValue.expressionLocation
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

  checkThatFunctionsAreIndependent(environmentRecordIdAfterGlobalCode: number) {
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

    let getEffectsFromAdditionalFunctionAndNestedFunctions = functionValue => {
      additionalFunctionStack.push(functionValue);
      invariant(functionValue instanceof ECMAScriptSourceFunctionValue);
      let call = this._callOfFunction(functionValue);
      let effects: Effects = this.realm.evaluatePure(() =>
        this.realm.evaluateForEffectsInGlobalEnv(call, undefined, "additional function")
      );
      invariant(effects);
      let additionalFunctionEffects = this._createAdditionalEffects(
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
              getEffectsFromAdditionalFunctionAndNestedFunctions(newEntry.value);
              // Now we have to rember the stack of effects that need to be applied to deal with
              // this additional function.
            }
          }
        }
        return null;
      }, additionalFunctionEffects.effects);
      invariant(additionalFunctionStack.pop() === functionValue);
    };

    while (additionalFunctionsToProcess.length > 0) {
      let funcValue = additionalFunctionsToProcess.shift().value;
      getEffectsFromAdditionalFunctionAndNestedFunctions(funcValue);
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
  ) {
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
