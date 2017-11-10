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
import { incorporateSavedCompletion, IsUnresolvableReference, ResolveBinding, Get } from "../methods/index.js";
import { AbruptCompletion, Completion, PossiblyNormalCompletion, ThrowCompletion } from "../completions.js";
import { AbstractValue, Value, FunctionValue, ObjectValue, NumberValue, StringValue } from "../values/index.js";
import * as t from "babel-types";
import type { BabelNodeIdentifier, BabelNodeLVal, BabelNodeCallExpression } from "babel-types";
import invariant from "../invariant.js";
import { Logger } from "./logger.js";
import { SerializerStatistics } from "./types.js";

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
  constructor(modules: Modules, statistics: SerializerStatistics, logModules: boolean) {
    super();
    this.modules = modules;
    this.evaluateForEffectsNesting = 0;
    this.requireStack = [];
    this.requireSequence = [];
    this.logModules = logModules;
    this.uninitializedModuleIdsRequiredInEvaluateForEffects = new Set();
    this.statistics = statistics;
  }

  modules: Modules;
  evaluateForEffectsNesting: number;
  requireStack: Array<number | string | void>;
  requireSequence: Array<number | string>;
  uninitializedModuleIdsRequiredInEvaluateForEffects: Set<number | string>;
  // We can't say that a module has been initialized if it was initialized in a
  // evaluate for effects context until we know the effects are applied.
  logModules: boolean;
  statistics: SerializerStatistics;

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

  detourCall(
    F: FunctionValue,
    thisArgument: void | Value,
    argumentsList: Array<Value>,
    newTarget: void | ObjectValue,
    performCall: () => Value
  ): void | Value {
    let realm = this.modules.realm;
    if (
      F === this.modules.getRequire() &&
      !this.modules.disallowDelayingRequiresOverride &&
      argumentsList.length === 1
    ) {
      let moduleId = argumentsList[0];
      let moduleIdValue;
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

      if (!this.modules.delayUnsupportedRequires) {
        if (
          (this.requireStack.length === 0 || this.requireStack[this.requireStack.length - 1] !== moduleIdValue) &&
          this.modules.moduleIds.has(moduleIdValue)
        ) {
          this.requireStack.push(moduleIdValue);
          try {
            let value = performCall();
            this.modules.recordModuleInitialized(moduleIdValue, value);
            // Make this into a join point by suppressing the conditional exception.
            // TODO: delete this code and let the caller deal with the conditional exception.
            let completion = incorporateSavedCompletion(realm, value);
            if (completion instanceof PossiblyNormalCompletion) {
              realm.stopEffectCapture(completion);
              let warning = new CompilerDiagnostic(
                "Module import may fail with an exception",
                completion.location,
                "PP0018",
                "Warning"
              );
              realm.handleError(warning);
            }
            return value;
          } finally {
            invariant(this.requireStack.pop() === moduleIdValue);
          }
        }
        return undefined;
      }

      // If a require fails, recover from it and delay the factory call until runtime
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
          this.uninitializedModuleIdsRequiredInEvaluateForEffects.add(moduleIdValue);
        return undefined;
      } else {
        return downgradeErrorsToWarnings(realm, () => {
          let result;
          try {
            this.requireStack.push(moduleIdValue);
            let requireSequenceStart = this.requireSequence.length;
            this.requireSequence.push(moduleIdValue);
            let acceleratedModuleIds, effects;
            const previousNumDelayedModules = this.statistics.delayedModules;
            do {
              try {
                effects = realm.evaluateForEffects(() => {
                  try {
                    return performCall();
                  } catch (e) {
                    if (e instanceof Completion) return e;
                    throw e;
                  }
                }, this);
              } catch (err) {
                if (err instanceof FatalError) effects = undefined;
                else throw err;
              }

              acceleratedModuleIds = [];
              if (isTopLevelRequire) {
                // We gathered all effects, but didn't apply them yet.
                // Let's check if there was any call to `require` in a
                // evaluate-for-effects context. If so, try to initialize
                // that module right now. Acceleration module initialization in this
                // way might not actually be desirable, but it works around
                // general prepack-limitations around joined abstract values involving
                // conditionals. Long term, Prepack needs to implement a notion of refinement
                // of conditional abstract values under the known path condition.
                for (let nestedModuleId of this.uninitializedModuleIdsRequiredInEvaluateForEffects) {
                  let nestedEffects = this.modules.tryInitializeModule(
                    nestedModuleId,
                    `accelerated initialization of conditional module ${nestedModuleId} as it's required in an evaluate-for-effects context by module ${moduleIdValue}`
                  );
                  if (
                    nestedEffects !== undefined &&
                    nestedEffects[0] instanceof Value &&
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
                  this.statistics.acceleratedModules += acceleratedModuleIds.length;
                }
              }
            } while (acceleratedModuleIds.length > 0);

            if (effects === undefined) {
              console.log(`delaying require(${moduleIdValue})`);
              this.statistics.delayedModules = previousNumDelayedModules + 1;
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
              result = effects[0];
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
                this.modules.recordModuleInitialized(moduleIdValue, result);
              }
            }
          } finally {
            let popped = this.requireStack.pop();
            invariant(popped === moduleIdValue);
            let message = "";
            if (result instanceof ThrowCompletion) message = " threw an error";
            this.log(`<require(${moduleIdValue})${message}`);
          }
          if (result instanceof Completion) throw result;
          return result;
        });
      }
    } else if (F === this.modules.getDefine()) {
      if (this.evaluateForEffectsNesting !== 0)
        this.modules.logger.logError(F, "Defining a module in nested partial evaluation is not supported.");
      let factoryFunction = argumentsList[0];
      if (factoryFunction instanceof FunctionValue) this.modules.factoryFunctions.add(factoryFunction);
      else this.modules.logger.logError(factoryFunction, "First argument to define function is not a function value.");
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
    statistics: SerializerStatistics,
    logModules: boolean,
    delayUnsupportedRequires: boolean
  ) {
    this.realm = realm;
    this.logger = logger;
    this._require = realm.intrinsics.undefined;
    this._define = realm.intrinsics.undefined;
    this.factoryFunctions = new Set();
    this.moduleIds = new Set();
    this.initializedModules = new Map();
    realm.tracers.push((this.moduleTracer = new ModuleTracer(this, statistics, logModules)));
    this.delayUnsupportedRequires = delayUnsupportedRequires;
    this.disallowDelayingRequiresOverride = false;
  }

  realm: Realm;
  logger: Logger;
  _require: Value;
  _define: Value;
  factoryFunctions: Set<FunctionValue>;
  moduleIds: Set<number | string>;
  initializedModules: Map<number | string, Value>;
  active: boolean;
  delayUnsupportedRequires: boolean;
  disallowDelayingRequiresOverride: boolean;
  moduleTracer: ModuleTracer;

  resolveInitializedModules(): void {
    this.initializedModules.clear();
    let globalInitializedModulesMap = this._getGlobalProperty("__initializedModules");
    invariant(globalInitializedModulesMap instanceof ObjectValue);
    for (let moduleId of globalInitializedModulesMap.properties.keys()) {
      let property = globalInitializedModulesMap.properties.get(moduleId);
      invariant(property);
      let moduleValue = property.descriptor && property.descriptor.value;
      if (moduleValue instanceof Value) this.initializedModules.set(moduleId, moduleValue);
    }
  }

  _getGlobalProperty(name: string): Value {
    if (this.active) return this.realm.intrinsics.undefined;
    this.active = true;
    try {
      let realm = this.realm;
      return this.logger.tryQuery(() => Get(realm, realm.$GlobalObject, name), realm.intrinsics.undefined, false);
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

  getIsRequire(
    formalParameters: Array<BabelNodeLVal>,
    functions: Array<FunctionValue>
  ): (scope: any, node: BabelNodeCallExpression) => boolean {
    let realm = this.realm;
    let logger = this.logger;
    let modules = this;
    return function(scope: any, node: BabelNodeCallExpression) {
      if (!t.isIdentifier(node.callee) || node.arguments.length !== 1 || !node.arguments[0]) return false;
      let argument = node.arguments[0];
      if (!t.isNumericLiteral(argument) && !t.isStringLiteral(argument)) return false;

      invariant(node.callee);
      let innerName = ((node.callee: any): BabelNodeIdentifier).name;

      for (let f of functions) {
        let scopedBinding = scope.getBinding(innerName);
        if (scopedBinding) {
          if (modules.factoryFunctions.has(f) && formalParameters[1] === scopedBinding.path.node) {
            invariant(scopedBinding.kind === "param");
            continue;
          }
          // The name binds to some local entity, but nothing we'd know what exactly it is
          return false;
        }

        let doesNotMatter = true;
        let reference = logger.tryQuery(
          () => ResolveBinding(realm, innerName, doesNotMatter, f.$Environment),
          undefined,
          false
        );
        if (reference === undefined) {
          // We couldn't resolve as we came across some behavior that we cannot deal with abstractly
          return false;
        }
        if (IsUnresolvableReference(realm, reference)) return false;
        let referencedBase = reference.base;
        let referencedName: string = (reference.referencedName: any);
        if (typeof referencedName !== "string") return false;
        let value;
        if (reference.base instanceof GlobalEnvironmentRecord) {
          value = logger.tryQuery(() => Get(realm, realm.$GlobalObject, innerName), realm.intrinsics.undefined, false);
        } else {
          invariant(referencedBase instanceof DeclarativeEnvironmentRecord);
          let binding = referencedBase.bindings[referencedName];
          if (!binding.initialized) return false;
          value = binding.value;
        }
        if (value !== modules.getRequire()) return false;
      }

      return true;
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
      let result = effects[0];
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

      let [compl, generator, bindings, properties, createdObjects] = realm.evaluateNodeForEffectsInGlobalEnv(node);
      // for lint unused
      invariant(bindings);

      if (compl instanceof AbruptCompletion) return undefined;
      invariant(compl instanceof Value);

      if (!generator.empty() || (compl instanceof ObjectValue && createdObjects.has(compl))) return undefined;
      // Check for escaping property assignments, if none escape, we got an existing object
      let escapes = false;
      for (let [binding] of properties) {
        let object = binding.object;
        invariant(object instanceof ObjectValue);
        if (!createdObjects.has(object)) escapes = true;
      }
      if (escapes) return undefined;

      return compl;
    } catch (err) {
      if (err instanceof FatalError) return undefined;
      throw err;
    } finally {
      realm.setReadOnly(oldReadOnly);
      this.disallowDelayingRequiresOverride = oldDisallowDelayingRequiresOverride;
    }
  }
}
