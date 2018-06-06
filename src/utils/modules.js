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
import { CompilerDiagnostic, FatalError } from "../errors.js";
import { Realm, Tracer } from "../realm.js";
import type { Effects } from "../realm.js";
import { Get } from "../methods/index.js";
import { AbruptCompletion, PossiblyNormalCompletion } from "../completions.js";
import { Environment } from "../singletons.js";
import {
  AbstractValue,
  Value,
  FunctionValue,
  ObjectValue,
  NumberValue,
  StringValue,
  ArrayValue,
  UndefinedValue,
  NullValue,
} from "../values/index.js";
import * as t from "babel-types";
import type {
  BabelNodeIdentifier,
  BabelNodeLVal,
  BabelNodeCallExpression,
  BabelNodeNumericLiteral,
  BabelNodeStringLiteral,
  BabelNodeMemberExpression,
} from "babel-types";
import invariant from "../invariant.js";
import { Logger } from "./logger.js";
import { SerializerStatistics } from "../serializer/statistics.js";

function downgradeErrorsToWarnings(realm: Realm, f: () => any) {
  let savedHandler = realm.errorHandler;
  function handler(e) {
    e.severity = "Warning";
    realm.errorHandler = savedHandler;
    try {
      return realm.handleError(e);
    } finally {
      realm.errorHandler = handler;
    }
  }
  realm.errorHandler = handler;
  try {
    return f();
  } finally {
    realm.errorHandler = savedHandler;
  }
}

export class ModuleTracer extends Tracer {
  constructor(modules: Modules, logModules: boolean) {
    super();
    this.modules = modules;
    this.evaluateForEffectsNesting = 0;
    this.requireStack = [];
    this.requireSequence = [];
    this.logModules = logModules;
    this.uninitializedModuleIdsRequiredInEvaluateForEffects = new Set();
  }

  modules: Modules;
  evaluateForEffectsNesting: number;
  requireStack: Array<number | string | void>;
  requireSequence: Array<number | string>;
  uninitializedModuleIdsRequiredInEvaluateForEffects: Set<number | string>;
  // We can't say that a module has been initialized if it was initialized in a
  // evaluate for effects context until we know the effects are applied.
  logModules: boolean;

  getStatistics(): SerializerStatistics {
    return this.modules.getStatistics();
  }

  log(message: string) {
    if (this.logModules) console.log(`[modules] ${this.requireStack.map(_ => "  ").join("")}${message}`);
  }

  beginEvaluateForEffects(state: any) {
    if (state !== this) {
      this.log(">evaluate for effects");
      this.evaluateForEffectsNesting++;
      this.requireStack.push(undefined);
    }
  }

  endEvaluateForEffects(state: any, effects: void | Effects) {
    if (state !== this) {
      let popped = this.requireStack.pop();
      invariant(popped === undefined);
      this.evaluateForEffectsNesting--;
      this.log("<evaluate for effects");
    }
  }

  // If we don't delay unsupported requires, we simply want to record here
  // when a module gets initialized, and then we return.
  _callRequireAndRecord(moduleIdValue: number | string, performCall: () => Value) {
    if (
      (this.requireStack.length === 0 || this.requireStack[this.requireStack.length - 1] !== moduleIdValue) &&
      this.modules.moduleIds.has(moduleIdValue)
    ) {
      this.requireStack.push(moduleIdValue);
      try {
        let value = performCall();
        this.modules.recordModuleInitialized(moduleIdValue, value);
        return value;
      } finally {
        invariant(this.requireStack.pop() === moduleIdValue);
      }
    }
    return undefined;
  }

  _callRequireAndAccelerate(
    isTopLevelRequire: boolean,
    moduleIdValue: number | string,
    performCall: () => Value
  ): void | Effects {
    let realm = this.modules.realm;
    let acceleratedModuleIds, effects;
    do {
      try {
        effects = realm.evaluateForEffects(() => performCall(), this, "_callRequireAndAccelerate");
      } catch (e) {
        e;
      }

      acceleratedModuleIds = [];
      if (isTopLevelRequire && effects !== undefined && !(effects.result instanceof AbruptCompletion)) {
        // We gathered all effects, but didn't apply them yet.
        // Let's check if there was any call to `require` in a
        // evaluate-for-effects context. If so, try to initialize
        // that module right now. Acceleration module initialization in this
        // way might not actually be desirable, but it works around
        // general prepack-limitations around joined abstract values involving
        // conditionals. Long term, Prepack needs to implement a notion of refinement
        // of conditional abstract values under the known path condition.
        // Example:
        //   if (*) require(1); else require(2);
        //   let x = require(1).X;
        // =>
        //   require(1);
        //   require(2);
        //   if (*) require(1); else require(2);
        //   let x = require(1).X;

        for (let nestedModuleId of this.uninitializedModuleIdsRequiredInEvaluateForEffects) {
          let nestedEffects = this.modules.tryInitializeModule(
            nestedModuleId,
            `accelerated initialization of conditional module ${nestedModuleId} as it's required in an evaluate-for-effects context by module ${moduleIdValue}`
          );
          if (
            this.modules.accelerateUnsupportedRequires &&
            nestedEffects !== undefined &&
            nestedEffects.result instanceof Value &&
            this.modules.isModuleInitialized(nestedModuleId)
          ) {
            acceleratedModuleIds.push(nestedModuleId);
          }
        }
        this.uninitializedModuleIdsRequiredInEvaluateForEffects.clear();
        // Keep restarting for as long as we find additional modules to accelerate.
        if (acceleratedModuleIds.length > 0) {
          console.log(
            `restarting require(${moduleIdValue}) after accelerating conditional require calls for ${acceleratedModuleIds.join()}`
          );
          this.getStatistics().acceleratedModules += acceleratedModuleIds.length;
        }
      }
    } while (acceleratedModuleIds.length > 0);

    return effects;
  }

  // If a require fails, recover from it and delay the factory call until runtime
  // Also, only in this mode, consider "accelerating" require calls, see below.
  _callRequireAndDelayIfNeeded(moduleIdValue: number | string, performCall: () => Value) {
    let realm = this.modules.realm;
    this.log(`>require(${moduleIdValue})`);
    let isTopLevelRequire = this.requireStack.length === 0;
    if (this.evaluateForEffectsNesting > 0) {
      if (isTopLevelRequire) {
        let diagnostic = new CompilerDiagnostic(
          "Non-deterministically conditional top-level require not currently supported",
          realm.currentLocation,
          "PP0017",
          "FatalError"
        );
        realm.handleError(diagnostic);
        throw new FatalError();
      } else if (!this.modules.isModuleInitialized(moduleIdValue))
        // Nested require call: We record that this happened. Just so that
        // if we discover later this this require call needs to get delayed,
        // then we still know (some of) which modules it in turn required,
        // and then we'll later "accelerate" requiring them to preserve the
        // require ordering. See below for more details on acceleration.
        this.uninitializedModuleIdsRequiredInEvaluateForEffects.add(moduleIdValue);

      return undefined;
    } else {
      return downgradeErrorsToWarnings(realm, () => {
        let result;
        try {
          this.requireStack.push(moduleIdValue);
          let requireSequenceStart = this.requireSequence.length;
          this.requireSequence.push(moduleIdValue);
          const previousNumDelayedModules = this.getStatistics().delayedModules;
          let effects = this._callRequireAndAccelerate(isTopLevelRequire, moduleIdValue, performCall);
          if (effects === undefined || effects.result instanceof AbruptCompletion) {
            console.log(`delaying require(${moduleIdValue})`);
            this.getStatistics().delayedModules = previousNumDelayedModules + 1;
            // So we are about to emit a delayed require(...) call.
            // However, before we do that, let's try to require all modules that we
            // know this delayed require call will require.
            // This way, we ensure that those modules will be fully initialized
            // before the require call executes.
            // TODO #690: More needs to be done to make the delayUnsupportedRequires
            // feature completely safe. Open issues are:
            // 1) Side-effects on the heap of delayed factory functions are not discovered or rejected.
            // 2) While we do process an appropriate list of transitively required modules here,
            //    it's likely just a subset / prefix of all transivitely required modules, as
            //    more modules would have been required if the Introspection exception had not been thrown.
            //    To be correct, those modules would have to be prepacked here as well.
            //    TODO #798: Watch out for an upcoming change to the __d module declaration where the statically known
            //    list of dependencies will be announced, so we'll no longer have to guess.
            let nestedModulesIds = new Set();
            for (let i = requireSequenceStart; i < this.requireSequence.length; i++) {
              let nestedModuleId = this.requireSequence[i];
              if (nestedModulesIds.has(nestedModuleId)) continue;
              nestedModulesIds.add(nestedModuleId);
              this.modules.tryInitializeModule(
                nestedModuleId,
                `initialization of module ${nestedModuleId} as it's required by module ${moduleIdValue}`
              );
            }

            result = AbstractValue.createTemporalFromBuildFunction(realm, Value, [], ([]) =>
              t.callExpression(t.identifier("require"), [t.valueToNode(moduleIdValue)])
            );
          } else {
            result = effects.result;
            if (result instanceof Value) {
              realm.applyEffects(effects, `initialization of module ${moduleIdValue}`);
              this.modules.recordModuleInitialized(moduleIdValue, result);
            } else if (result instanceof PossiblyNormalCompletion) {
              let warning = new CompilerDiagnostic(
                "Module import may fail with an exception",
                result.location,
                "PP0018",
                "Warning"
              );
              realm.handleError(warning);
              result = result.value;
              realm.applyEffects(effects, `initialization of module ${moduleIdValue}`);
            } else {
              invariant(false);
            }
          }
        } finally {
          let popped = this.requireStack.pop();
          invariant(popped === moduleIdValue);
          this.log(`<require(${moduleIdValue})`);
        }
        invariant(result instanceof Value);
        return result;
      });
    }
  }

  _tryExtractDependencies(value: void | Value): void | Array<Value> {
    if (value === undefined || value instanceof NullValue || value instanceof UndefinedValue) return [];
    if (value instanceof ArrayValue) {
      const realm = this.modules.realm;
      const lengthValue = Get(realm, value, "length");
      if (lengthValue instanceof NumberValue) {
        const dependencies = [];
        const logger = this.modules.logger;
        for (let i = 0; i < lengthValue.value; i++) {
          const elementValue = logger.tryQuery(
            () => Get(realm, ((value: any): ArrayValue), "" + i),
            realm.intrinsics.undefined
          );
          dependencies.push(elementValue);
        }
        return dependencies;
      }
    }
    return undefined;
  }

  detourCall(
    F: FunctionValue,
    thisArgument: void | Value,
    argumentsList: Array<Value>,
    newTarget: void | ObjectValue,
    performCall: () => Value
  ): void | Value {
    if (
      F === this.modules.getRequire() &&
      !this.modules.disallowDelayingRequiresOverride &&
      argumentsList.length === 1
    ) {
      // Here, we handle calls of the form
      //   require(42)

      let moduleId = argumentsList[0];
      let moduleIdValue;
      // Do some sanity checks and request require(...) calls with bad arguments
      if (moduleId instanceof NumberValue || moduleId instanceof StringValue) {
        moduleIdValue = moduleId.value;
        if (!this.modules.moduleIds.has(moduleIdValue) && this.modules.delayUnsupportedRequires) {
          this.modules.logger.logError(moduleId, "Module referenced by require call has not been defined.");
        }
      } else {
        if (this.modules.delayUnsupportedRequires) {
          this.modules.logger.logError(moduleId, "First argument to require function is not a number or string value.");
        }
        return undefined;
      }

      if (this.modules.delayUnsupportedRequires) return this._callRequireAndDelayIfNeeded(moduleIdValue, performCall);
      else return this._callRequireAndRecord(moduleIdValue, performCall);
    } else if (F === this.modules.getDefine()) {
      // Here, we handle calls of the form
      //   __d(factoryFunction, moduleId, dependencyArray)

      if (this.evaluateForEffectsNesting !== 0)
        this.modules.logger.logError(F, "Defining a module in nested partial evaluation is not supported.");
      let factoryFunction = argumentsList[0];
      if (factoryFunction instanceof FunctionValue) {
        let dependencies = this._tryExtractDependencies(argumentsList[2]);
        if (dependencies !== undefined) this.modules.factoryFunctionDependencies.set(factoryFunction, dependencies);
        else
          this.modules.logger.logError(
            argumentsList[2],
            "Third argument to define function is present but not a concrete array."
          );
      } else
        this.modules.logger.logError(factoryFunction, "First argument to define function is not a function value.");
      let moduleId = argumentsList[1];
      if (moduleId instanceof NumberValue || moduleId instanceof StringValue)
        this.modules.moduleIds.add(moduleId.value);
      else
        this.modules.logger.logError(moduleId, "Second argument to define function is not a number or string value.");
    }
    return undefined;
  }
}

export class Modules {
  constructor(
    realm: Realm,
    logger: Logger,
    logModules: boolean,
    delayUnsupportedRequires: boolean,
    accelerateUnsupportedRequires: boolean
  ) {
    this.realm = realm;
    this.logger = logger;
    this._require = realm.intrinsics.undefined;
    this._define = realm.intrinsics.undefined;
    this.factoryFunctionDependencies = new Map();
    this.moduleIds = new Set();
    this.initializedModules = new Map();
    realm.tracers.push((this.moduleTracer = new ModuleTracer(this, logModules)));
    this.delayUnsupportedRequires = delayUnsupportedRequires;
    this.accelerateUnsupportedRequires = accelerateUnsupportedRequires;
    this.disallowDelayingRequiresOverride = false;
  }

  realm: Realm;
  logger: Logger;
  _require: Value;
  _define: Value;
  factoryFunctionDependencies: Map<FunctionValue, Array<Value>>;
  moduleIds: Set<number | string>;
  initializedModules: Map<number | string, Value>;
  active: boolean;
  delayUnsupportedRequires: boolean;
  accelerateUnsupportedRequires: boolean;
  disallowDelayingRequiresOverride: boolean;
  moduleTracer: ModuleTracer;

  getStatistics(): SerializerStatistics {
    invariant(this.realm.statistics instanceof SerializerStatistics, "serialization requires SerializerStatistics");
    return this.realm.statistics;
  }

  resolveInitializedModules(): void {
    this.initializedModules.clear();
    let globalInitializedModulesMap = this._getGlobalProperty("__initializedModules");
    invariant(globalInitializedModulesMap instanceof ObjectValue);
    for (let moduleId of globalInitializedModulesMap.properties.keys()) {
      let property = globalInitializedModulesMap.properties.get(moduleId);
      invariant(property);
      let moduleValue = property.descriptor && property.descriptor.value;
      if (moduleValue instanceof Value && !moduleValue.mightHaveBeenDeleted()) {
        this.initializedModules.set(moduleId, moduleValue);
      }
    }
    this.getStatistics().initializedModules = this.initializedModules.size;
    this.getStatistics().totalModules = this.moduleIds.size;
  }

  _getGlobalProperty(name: string): Value {
    if (this.active) return this.realm.intrinsics.undefined;
    this.active = true;
    try {
      let realm = this.realm;
      return this.logger.tryQuery(() => Get(realm, realm.$GlobalObject, name), realm.intrinsics.undefined);
    } finally {
      this.active = false;
    }
  }

  getRequire(): Value {
    if (!(this._require instanceof FunctionValue)) this._require = this._getGlobalProperty("require");
    return this._require;
  }

  getDefine(): Value {
    if (!(this._define instanceof FunctionValue)) this._define = this._getGlobalProperty("__d");
    return this._define;
  }

  // Returns a function that checks if a call node represents a call to a
  // known require function, and if so, what module id that call indicates.
  // A known require function call is either of the form
  //   ... require(42) ...
  // where require resolves to the global require function, or
  //   factoryFunction(, require, , , dependencies) {
  //     ...
  //       ... require(dependencies[3]) ...
  // where factoryFunction and dependencies were announced as part of the
  // global code execution via a global module declaration call such as
  //   global.__d(factoryFunction, , [0,2,4,6,8])
  getGetModuleIdIfNodeIsRequireFunction(
    formalParameters: Array<BabelNodeLVal>,
    functions: Array<FunctionValue>
  ): (scope: any, node: BabelNodeCallExpression) => void | number | string {
    let realm = this.realm;
    let logger = this.logger;
    let modules = this;
    return (scope: any, node: BabelNodeCallExpression) => {
      // Are we calling a function that has a single name and a single argument?
      if (!t.isIdentifier(node.callee) || node.arguments.length !== 1) return undefined;
      let argument = node.arguments[0];
      if (!argument) return undefined;

      if (!t.isNumericLiteral(argument) && !t.isStringLiteral(argument) && !t.isMemberExpression(argument))
        return undefined;

      invariant(node.callee);
      let innerName = ((node.callee: any): BabelNodeIdentifier).name;

      let moduleId;

      // Helper function used to give up if we ever come up with different module ids for different functions
      let updateModuleId = newModuleId => {
        if (moduleId !== undefined && moduleId !== newModuleId) return false;
        moduleId = newModuleId;
        return true;
      };

      // Helper function that retrieves module id from call argument, possibly chasing dependency array indirection
      const getModuleId = (dependencies?: Array<Value>): void | number | string => {
        if (t.isMemberExpression(argument)) {
          if (dependencies !== undefined) {
            let memberExpression = ((argument: any): BabelNodeMemberExpression);
            if (t.isIdentifier(memberExpression.object)) {
              let scopedBinding = scope.getBinding(((memberExpression.object: any): BabelNodeIdentifier).name);
              if (scopedBinding && formalParameters[4] === scopedBinding.path.node) {
                if (t.isNumericLiteral(memberExpression.property)) {
                  let dependencyIndex = memberExpression.property.value;
                  if (
                    Number.isInteger(dependencyIndex) &&
                    dependencyIndex >= 0 &&
                    dependencyIndex < dependencies.length
                  ) {
                    let dependency = dependencies[dependencyIndex];
                    if (dependency instanceof NumberValue || dependency instanceof StringValue) return dependency.value;
                  }
                }
              }
            }
          }
        } else {
          return ((argument: any): BabelNodeNumericLiteral | BabelNodeStringLiteral).value;
        }
      };

      // Let's consider each of the function instances (closures for the same code)
      for (let f of functions) {
        // 1. Let's check if we have a match for a factory function like
        //      factoryFunction(, require, , , [dependencies])
        //    which is used with the Metro bundler
        let scopedBinding = scope.getBinding(innerName);
        if (scopedBinding) {
          let dependencies = modules.factoryFunctionDependencies.get(f);
          if (dependencies !== undefined && formalParameters[1] === scopedBinding.path.node) {
            invariant(scopedBinding.kind === "param");
            let newModuleId = getModuleId(dependencies);
            if (newModuleId !== undefined && !updateModuleId(newModuleId)) return undefined;
            continue;
          }

          // The name binds to some local entity, but nothing we'd know what exactly it is
          return undefined;
        }

        // 2. Let's check if we can resolve the called function just by looking at the
        //    function instance environment.
        //    TODO: We should not do this if the current node is in a nested function!

        // We won't have a dependency map here, so this only works for literal arguments.
        if (!t.isNumericLiteral(argument) && !t.isStringLiteral(argument)) return undefined;

        let doesNotMatter = true;
        let reference = logger.tryQuery(
          () => Environment.ResolveBinding(realm, innerName, doesNotMatter, f.$Environment),
          undefined
        );
        if (reference === undefined) {
          // We couldn't resolve as we came across some behavior that we cannot deal with abstractly
          return undefined;
        }
        if (Environment.IsUnresolvableReference(realm, reference)) return undefined;
        let referencedBase = reference.base;
        let referencedName: string = (reference.referencedName: any);
        if (typeof referencedName !== "string") return undefined;
        let value;
        if (reference.base instanceof GlobalEnvironmentRecord) {
          value = logger.tryQuery(() => Get(realm, realm.$GlobalObject, innerName), realm.intrinsics.undefined);
        } else {
          invariant(referencedBase instanceof DeclarativeEnvironmentRecord);
          let binding = referencedBase.bindings[referencedName];
          if (!binding.initialized) return undefined;
          value = binding.value;
        }
        if (value !== modules.getRequire()) return undefined;
        const newModuleId = getModuleId();
        invariant(newModuleId !== undefined);
        if (!updateModuleId(newModuleId)) return undefined;
      }

      return moduleId;
    };
  }

  recordModuleInitialized(moduleId: number | string, value: Value) {
    this.realm.assignToGlobal(
      t.memberExpression(
        t.memberExpression(t.identifier("global"), t.identifier("__initializedModules")),
        t.identifier("" + moduleId)
      ),
      value
    );
  }

  tryInitializeModule(moduleId: number | string, message: string): void | Effects {
    let realm = this.realm;
    let previousDisallowDelayingRequiresOverride = this.disallowDelayingRequiresOverride;
    this.disallowDelayingRequiresOverride = true;
    return downgradeErrorsToWarnings(realm, () => {
      try {
        let node = t.callExpression(t.identifier("require"), [t.valueToNode(moduleId)]);

        let effects = realm.evaluateNodeForEffectsInGlobalEnv(node);
        realm.applyEffects(effects, message);
        return effects;
      } catch (err) {
        if (err instanceof FatalError) return undefined;
        else throw err;
      } finally {
        this.disallowDelayingRequiresOverride = previousDisallowDelayingRequiresOverride;
      }
    });
  }

  initializeMoreModules() {
    // partially evaluate all factory methods by calling require
    let count = 0;
    for (let moduleId of this.moduleIds) {
      if (this.initializedModules.has(moduleId)) continue;
      let effects = this.tryInitializeModule(moduleId, `Speculative initialization of module ${moduleId}`);
      if (effects === undefined) continue;
      let result = effects.result;
      if (!(result instanceof Value)) continue; // module might throw
      count++;
      this.initializedModules.set(moduleId, result);
    }
    if (count > 0) console.log(`=== speculatively initialized ${count} additional modules`);
  }

  isModuleInitialized(moduleId: number | string): void | Value {
    let realm = this.realm;
    let oldReadOnly = realm.setReadOnly(true);
    let oldDisallowDelayingRequiresOverride = this.disallowDelayingRequiresOverride;
    this.disallowDelayingRequiresOverride = true;
    try {
      let node = t.callExpression(t.identifier("require"), [t.valueToNode(moduleId)]);

      let {
        result,
        generator,
        modifiedBindings,
        modifiedProperties,
        createdObjects,
      } = realm.evaluateNodeForEffectsInGlobalEnv(node);
      // for lint unused
      invariant(modifiedBindings);

      if (result instanceof AbruptCompletion) return undefined;
      invariant(result instanceof Value);

      if (!generator.empty() || (result instanceof ObjectValue && createdObjects.has(result))) return undefined;
      // Check for escaping property assignments, if none escape, we got an existing object
      let escapes = false;
      for (let [binding] of modifiedProperties) {
        let object = binding.object;
        invariant(object instanceof ObjectValue);
        if (!createdObjects.has(object)) escapes = true;
      }
      if (escapes) return undefined;

      return result;
    } catch (err) {
      if (err instanceof FatalError) return undefined;
      throw err;
    } finally {
      realm.setReadOnly(oldReadOnly);
      this.disallowDelayingRequiresOverride = oldDisallowDelayingRequiresOverride;
    }
  }
}
