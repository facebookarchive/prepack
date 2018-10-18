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
import { Realm, Tracer } from "../realm.js";
import type { Effects } from "../realm.js";
import type { FunctionBodyAstNode } from "../types.js";
import { Get } from "../methods/index.js";
import { Environment } from "../singletons.js";
import {
  Value,
  BoundFunctionValue,
  ECMAScriptSourceFunctionValue,
  FunctionValue,
  ObjectValue,
  NumberValue,
  StringValue,
  ArrayValue,
  UndefinedValue,
  NullValue,
} from "../values/index.js";
import { NormalCompletion } from "../completions.js";
import * as t from "@babel/types";
import type {
  BabelNodeIdentifier,
  BabelNodeLVal,
  BabelNodeCallExpression,
  BabelNodeNumericLiteral,
  BabelNodeStringLiteral,
  BabelNodeMemberExpression,
} from "@babel/types";
import invariant from "../invariant.js";
import { Logger } from "./logger.js";
import { SerializerStatistics } from "../serializer/statistics.js";
import { PropertyDescriptor } from "../descriptors.js";

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

  log(message: string): void {
    if (this.logModules) console.log(`[modules] ${this.requireStack.map(_ => "  ").join("")}${message}`);
  }

  beginEvaluateForEffects(state: any): void {
    if (state !== this) {
      this.log(">evaluate for effects");
      this.evaluateForEffectsNesting++;
      this.requireStack.push(undefined);
    }
  }

  endEvaluateForEffects(state: any, effects: void | Effects): void {
    if (state !== this) {
      let popped = this.requireStack.pop();
      invariant(popped === undefined);
      this.evaluateForEffectsNesting--;
      this.log("<evaluate for effects");
    }
  }

  _callRequireAndRecord(moduleIdValue: number | string, performCall: () => Value): void | Value {
    if (this.requireStack.length === 0 || this.requireStack[this.requireStack.length - 1] !== moduleIdValue) {
      this.requireStack.push(moduleIdValue);
      try {
        let value = performCall();
        if (this.modules.moduleIds.has("" + moduleIdValue)) this.modules.recordModuleInitialized(moduleIdValue, value);
        return value;
      } finally {
        invariant(this.requireStack.pop() === moduleIdValue);
      }
    }
    return undefined;
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
    let requireInfo = this.modules.getRequireInfo();
    if (requireInfo !== undefined && F === requireInfo.value && argumentsList.length === 1) {
      // Here, we handle calls of the form
      //   require(42)

      let moduleId = argumentsList[0];
      let moduleIdValue;

      // Do some sanity checks and request require(...) calls with bad arguments
      if (moduleId instanceof NumberValue || moduleId instanceof StringValue) moduleIdValue = moduleId.value;
      else return performCall();
      // call require(...); this might cause calls to the define function
      let res = this._callRequireAndRecord(moduleIdValue, performCall);
      if (F.$Realm.eagerlyRequireModuleDependencies) {
        // all dependencies of the required module should now be known
        let dependencies = this.modules.moduleDependencies.get(moduleIdValue);
        if (dependencies === undefined)
          this.modules.logger.logError(moduleId, `Cannot resolve module dependencies for ${moduleIdValue.toString()}.`);
        else
          for (let dependency of dependencies) {
            // We'll try to initialize module dependency on a best-effort basis,
            // ignoring any errors. Note that tryInitializeModule applies effects on success.
            if (dependency instanceof NumberValue || dependency instanceof StringValue)
              this.modules.tryInitializeModule(dependency.value, `Eager initialization of module ${dependency.value}`);
          }
      }
      return res;
    } else if (F === this.modules.getDefine()) {
      // Here, we handle calls of the form
      //   __d(factoryFunction, moduleId, dependencyArray)
      let moduleId = argumentsList[1];
      if (moduleId instanceof NumberValue || moduleId instanceof StringValue) {
        let moduleIdValue = moduleId.value;
        let factoryFunction = argumentsList[0];
        if (factoryFunction instanceof FunctionValue) {
          this.modules.moduleIds.add("" + moduleIdValue);
          let dependencies = this._tryExtractDependencies(argumentsList[2]);
          if (dependencies !== undefined) {
            this.modules.moduleDependencies.set(moduleIdValue, dependencies);
            this.modules.factoryFunctionDependencies.set(factoryFunction, dependencies);
          } else
            this.modules.logger.logError(
              argumentsList[2],
              "Third argument to define function is present but not a concrete array."
            );

          // Remove if explicitly marked at optimization time
          let realm = factoryFunction.$Realm;
          if (realm.removeModuleFactoryFunctions) {
            let targetFunction = factoryFunction;
            if (factoryFunction instanceof BoundFunctionValue) targetFunction = factoryFunction.$BoundTargetFunction;
            invariant(targetFunction instanceof ECMAScriptSourceFunctionValue);
            let body = ((targetFunction.$ECMAScriptCode: any): FunctionBodyAstNode);
            let uniqueOrderedTag = body.uniqueOrderedTag;
            invariant(uniqueOrderedTag !== undefined);
            realm.moduleFactoryFunctionsToRemove.set(uniqueOrderedTag, "" + moduleId.value);
          }
        } else
          this.modules.logger.logError(factoryFunction, "First argument to define function is not a function value.");
      } else
        this.modules.logger.logError(moduleId, "Second argument to define function is not a number or string value.");
    }
    return undefined;
  }
}

export type RequireInfo = {
  value: FunctionValue,
  globalName: string,
};

export class Modules {
  constructor(realm: Realm, logger: Logger, logModules: boolean) {
    this.realm = realm;
    this.logger = logger;
    this._define = realm.intrinsics.undefined;
    this.factoryFunctionDependencies = new Map();
    this.moduleDependencies = new Map();
    this.moduleIds = new Set();
    this.initializedModules = new Map();
    realm.tracers.push((this.moduleTracer = new ModuleTracer(this, logModules)));
  }

  realm: Realm;
  logger: Logger;
  _requireInfo: void | RequireInfo;
  _define: Value;
  factoryFunctionDependencies: Map<FunctionValue, Array<Value>>;
  moduleDependencies: Map<number | string, Array<Value>>;
  moduleIds: Set<string>;
  initializedModules: Map<string, Value>;
  active: boolean;
  moduleTracer: ModuleTracer;

  getStatistics(): SerializerStatistics {
    invariant(this.realm.statistics instanceof SerializerStatistics, "serialization requires SerializerStatistics");
    return this.realm.statistics;
  }

  resolveInitializedModules(): void {
    let globalInitializedModulesMap = this._getGlobalProperty("__initializedModules");
    invariant(globalInitializedModulesMap instanceof ObjectValue);
    for (let moduleId of globalInitializedModulesMap.properties.keys()) {
      let property = globalInitializedModulesMap.properties.get(moduleId);
      invariant(property);
      if (property.descriptor instanceof PropertyDescriptor) {
        let moduleValue = property.descriptor && property.descriptor.value;
        if (moduleValue instanceof Value && !moduleValue.mightHaveBeenDeleted()) {
          this.initializedModules.set(moduleId, moduleValue);
        }
      }
    }

    let moduleFactoryFunctionsToRemove = this.realm.moduleFactoryFunctionsToRemove;
    for (let [functionId, moduleIdOfFunction] of this.realm.moduleFactoryFunctionsToRemove) {
      if (!this.initializedModules.has(moduleIdOfFunction)) moduleFactoryFunctionsToRemove.delete(functionId);
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

  getRequireInfo(): void | RequireInfo {
    if (this._requireInfo === undefined)
      for (let globalName of ["require", "__r"]) {
        let value = this._getGlobalProperty(globalName);
        if (value instanceof FunctionValue) {
          this._requireInfo = { value, globalName };
          break;
        }
      }
    return this._requireInfo;
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
        let requireInfo = modules.getRequireInfo();
        if (requireInfo === undefined || value !== requireInfo.value) return undefined;
        const newModuleId = getModuleId();
        invariant(newModuleId !== undefined);
        if (!updateModuleId(newModuleId)) return undefined;
      }

      return moduleId;
    };
  }

  recordModuleInitialized(moduleId: number | string, value: Value): void {
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
    let requireInfo = this.getRequireInfo();
    if (requireInfo === undefined) return undefined;
    return downgradeErrorsToWarnings(realm, () => {
      try {
        let node = t.callExpression(t.identifier(requireInfo.globalName), [t.valueToNode(moduleId)]);

        let effects = realm.evaluateNodeForEffectsInGlobalEnv(node);
        realm.applyEffects(effects, message);
        return effects;
      } catch (err) {
        if (err instanceof FatalError) return undefined;
        else throw err;
      }
    });
  }

  initializeMoreModules(modulesToInitialize: Set<string | number> | "ALL"): void {
    // partially evaluate all factory methods by calling require
    let count = 0;
    let body = (moduleId: string) => {
      if (this.initializedModules.has(moduleId)) return;
      let moduleIdNumberIfNumeric = parseInt(moduleId, 10);
      if (isNaN(moduleIdNumberIfNumeric)) moduleIdNumberIfNumeric = moduleId;
      let effects = this.tryInitializeModule(
        moduleIdNumberIfNumeric,
        `Speculative initialization of module ${moduleId}`
      );
      if (effects === undefined) return;
      let result = effects.result;
      if (!(result instanceof NormalCompletion)) return; // module might throw
      count++;
      this.initializedModules.set(moduleId, result.value);
    };
    if (modulesToInitialize === "ALL") {
      for (let moduleId of this.moduleIds) body(moduleId);
    } else {
      for (let moduleId of modulesToInitialize) body("" + moduleId);
    }
    if (count > 0) console.log(`=== speculatively initialized ${count} additional modules`);
  }
}
