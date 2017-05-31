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
import { Realm, ExecutionContext, Tracer } from "../realm.js";
import type { Effects } from "../realm.js";
import { IsUnresolvableReference, ResolveBinding, ToStringPartial, Get } from "../methods/index.js";
import { Completion, AbruptCompletion, IntrospectionThrowCompletion, ThrowCompletion } from "../completions.js";
import { Value, FunctionValue, ObjectValue, NumberValue, StringValue } from "../values/index.js";
import { TypesDomain, ValuesDomain } from "../domains/index.js";
import * as t from "babel-types";
import type { BabelNodeIdentifier, BabelNodeLVal, BabelNodeCallExpression } from "babel-types";
import invariant from "../invariant.js";
import { Logger } from "./logger.js";

class ModuleTracer extends Tracer {
  constructor(modules: Modules, logModules: boolean) {
    super();
    this.modules = modules;
    this.partialEvaluation = 0;
    this.requireStack = [];
    this.requireSequence = [];
    this.logModules = logModules;
  }

  modules: Modules;
  partialEvaluation: number;
  requireStack: Array<number | string | void>;
  requireSequence: Array<number | string>;
  logModules: boolean;

  log(message: string) {
    if (this.logModules) console.log(`[modules] ${this.requireStack.map(_ => "  ").join("")}${message}`);
  }

  beginPartialEvaluation() {
    this.log(">partial evaluation");
    this.partialEvaluation++;
    this.requireStack.push(undefined);
  }

  endPartialEvaluation(effects: void | Effects) {
    let popped = this.requireStack.pop();
    invariant(popped === undefined);
    this.partialEvaluation--;
    this.log("<partial evaluation");
  }

  detourCall(F: FunctionValue, thisArgument: void | Value, argumentsList: Array<Value>, newTarget: void | ObjectValue, performCall: () => Value): void | Value {
    let realm = this.modules.realm;
    if (F === this.modules.getRequire() && this.modules.delayUnsupportedRequires && argumentsList.length === 1) {
      let moduleId = argumentsList[0];
      let moduleIdValue;
      if (moduleId instanceof NumberValue || moduleId instanceof StringValue) {
        moduleIdValue = moduleId.value;
        if (!this.modules.moduleIds.has(moduleIdValue)) {
          this.modules.logger.logError(moduleId, "Module referenced by require call has not been defined.");
        }
      } else {
        this.modules.logger.logError(moduleId, "First argument to require function is not a number or string value.");
        return undefined;
      }
      this.log(`>require(${moduleIdValue})`);
      let result;
      try {
        this.requireStack.push(moduleIdValue);
        let requireSequenceStart = this.requireSequence.length;
        this.requireSequence.push(moduleIdValue);
        let effects = realm.evaluateForEffects(() => {
          try {
            return performCall();
          } catch (e) {
            if (e instanceof Completion) return e;
            throw e;
          }
        });
        [result] = effects;
        invariant(result instanceof Value || result instanceof Completion);
        if (result instanceof IntrospectionThrowCompletion) {
          let [message, stack] = this.modules.getMessageAndStack(effects);
          console.log(`delaying require(${moduleIdValue}): ${message} ${stack}`);
          // So we are about to emit a delayed require(...) call.
          // However, before we do that, let's try to require all modules that we
          // know this delayed require call will require.
          // This way, we ensure that those modules will be fully initialized
          // before the require call executes.
          // TODO: More needs to be done to make the delayUnsupportedRequires
          // feature completely safe. Open issues are:
          // 1) Side-effects on the heap of delayed factory functions are not discovered or rejected.
          // 2) While we do process an appropriate list of transitively required modules here,
          //    more modules would have been required if the Introspection exception had not been thrown.
          //    To be correct, those modules would have to be prepacked here as well.
          let nestedModulesIds = new Set();
          for (let i = requireSequenceStart; i < this.requireSequence.length; i++) {
            let nestedModuleId = this.requireSequence[i];
            if (nestedModulesIds.has(nestedModuleId)) continue;
            nestedModulesIds.add(nestedModuleId);
            this.modules.tryInitializeModule(
              nestedModuleId,
              `initialization of module ${nestedModuleId} as it's required by module ${moduleIdValue}`);
          }

          result = realm.deriveAbstract(
            TypesDomain.topVal,
            ValuesDomain.topVal, [],
             ([]) => t.callExpression(t.identifier("require"), [t.valueToNode(moduleIdValue)]));
        } else {
          realm.applyEffects(effects, `initialization of module ${moduleIdValue}`);
        }
      } finally {
        let popped = this.requireStack.pop();
        invariant(popped === moduleIdValue);
        let message = "";
        invariant(!(result instanceof IntrospectionThrowCompletion));
        if (result instanceof ThrowCompletion) message = " threw an error";
        this.log(`<require(${moduleIdValue})${message}`);
      }
      if (result instanceof Completion) throw result;
      return result;
    } else if (F === this.modules.getDefine()) {
      if (this.partialEvaluation !== 0) this.modules.logger.logError(F, "Defining a module in nested partial evaluation is not supported.");
      let factoryFunction = argumentsList[0];
      if (factoryFunction instanceof FunctionValue) this.modules.factoryFunctions.add(factoryFunction);
      else this.modules.logger.logError(factoryFunction, "First argument to define function is not a function value.");
      let moduleId = argumentsList[1];
      if (moduleId instanceof NumberValue || moduleId instanceof StringValue) this.modules.moduleIds.add(moduleId.value);
      else this.modules.logger.logError(moduleId, "Second argument to define function is not a number or string value.");
    }
    return undefined;
  }
}


export class Modules {
  constructor(realm: Realm, logger: Logger, logModules: boolean, delayUnsupportedRequires: boolean) {
    this.realm = realm;
    this.logger = logger;
    this._require = realm.intrinsics.undefined;
    this._define = realm.intrinsics.undefined;
    this.factoryFunctions = new Set();
    this.moduleIds = new Set();
    this.initializedModules = new Map();
    realm.tracers.push(new ModuleTracer(this, logModules));
    this.delayUnsupportedRequires = delayUnsupportedRequires;
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

  _getGlobalProperty(name: string) {
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

  getIsRequire(formalParameters: Array<BabelNodeLVal>, functions: Array<FunctionValue>): (scope: any, node: BabelNodeCallExpression) => boolean {
    let realm = this.realm;
    let logger = this.logger;
    let modules = this;
    return function (scope: any, node: BabelNodeCallExpression) {
      if (!t.isIdentifier(node.callee) ||
        node.arguments.length !== 1 ||
        !node.arguments[0]) return false;
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
          undefined, false);
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
          value = logger.tryQuery(() =>
            Get(realm, realm.$GlobalObject, innerName), realm.intrinsics.undefined, false);
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

  getMessageAndStack([result, generator, bindings, properties, createdObjects]: Effects): [string, string] {
    let realm = this.realm;
    if (!(result instanceof Completion) || !(result.value instanceof ObjectValue))
      return ["(no message)", "(no stack)"];

    // Temporarily apply state changes in order to retrieve message
    realm.restoreBindings(bindings);
    realm.restoreProperties(properties);

    let value = result.value;
    let message: string = this.logger.tryQuery(() => ToStringPartial(realm, Get(realm, ((value: any): ObjectValue), "message")), "(cannot get message)", false);
    let stack: string = this.logger.tryQuery(() => ToStringPartial(realm, Get(realm, ((value: any): ObjectValue), "stack")), "", false);

    // Undo state changes
    realm.restoreBindings(bindings);
    realm.restoreProperties(properties);

    if (result instanceof IntrospectionThrowCompletion && result.reason !== undefined)
      message = `[${result.reason}] ${message}`;

    let i = stack.indexOf("\n");
    if (i >= 0) stack = stack.slice(i);
    return [message, stack];
  }

  tryInitializeModule(moduleId: number | string, message: string): void | Effects {
    let realm = this.realm;
    // setup execution environment
    let context = new ExecutionContext();
    let env = realm.$GlobalEnv;
    context.lexicalEnvironment = env;
    context.variableEnvironment = env;
    context.realm = realm;
    let oldDelayUnsupportedRequires = this.delayUnsupportedRequires;
    this.delayUnsupportedRequires = false;
    realm.pushContext(context);
    try {
      let node = t.callExpression(t.identifier("require"), [t.valueToNode(moduleId)]);

      let effects = realm.evaluateNodeForEffects(node, true, env);
      let result = effects[0];
      if (result instanceof IntrospectionThrowCompletion) return effects;

      realm.applyEffects(effects, message);
      if (result instanceof Completion) {
        console.log(`=== UNEXPECTED ERROR during ${message} ===`);
        this.logger.logCompletion(result);
        return undefined;
      }

      return effects;
    } finally {
      realm.popContext(context);
      this.delayUnsupportedRequires = oldDelayUnsupportedRequires;
    }
  }

  initializeMoreModules() {
    // partially evaluate all factory methods by calling require
    let count = 0;
    let introspectionErrors = Object.create(null);
    for (let moduleId of this.moduleIds) {
      if (this.initializedModules.has(moduleId)) continue;

      let effects = this.tryInitializeModule(
        moduleId,
        `Speculative initialization of module ${moduleId}`);

      if (effects === undefined) break;
      let result = effects[0];
      if (result instanceof IntrospectionThrowCompletion) {
        invariant(result instanceof IntrospectionThrowCompletion);
        let [message, stack] = this.getMessageAndStack(effects);
        let stacks = introspectionErrors[message] = introspectionErrors[message] || [];
        stacks.push(stack);
        continue;
      }

      invariant(result instanceof Value);
      count++;
      this.initializedModules.set(moduleId, result);
    }
    if (count > 0) console.log(`=== speculatively initialized ${count} additional modules`);
    let a = [];
    for (let key in introspectionErrors) a.push([introspectionErrors[key], key]);
    a.sort((x, y) => y[0].length - x[0].length);
    if (a.length) {
      console.log(`=== speculative module initialization failures ordered by frequency`);
      for (let [stacks, n] of a) console.log(`${stacks.length}x ${n} ${stacks.join("\nas well as")}]`);
    }
  }

  resolveInitializedModules(): void {
    // partial evaluate all possible requires and see which are possible to inline
    let realm = this.realm;
    // setup execution environment
    let context = new ExecutionContext();
    let env = realm.$GlobalEnv;
    context.lexicalEnvironment = env;
    context.variableEnvironment = env;
    context.realm = realm;
    realm.pushContext(context);
    let oldReadOnly = realm.setReadOnly(true);
    let oldDelayUnsupportedRequires = this.delayUnsupportedRequires;
    this.delayUnsupportedRequires = false;
    try {
      for (let moduleId of this.moduleIds) {
        let node = t.callExpression(t.identifier("require"), [t.valueToNode(moduleId)]);

        let [compl, generator, bindings, properties, createdObjects] =
          realm.evaluateNodeForEffects(node, true, env);
        // for lint unused
        invariant(bindings);

        if (compl instanceof AbruptCompletion) continue;
        invariant(compl instanceof Value);

        if (generator.body.length !== 0 ||
          (compl instanceof ObjectValue && createdObjects.has(compl))) continue;
        // Check for escaping property assignments, if none escape, we're safe
        // to replace the require with its exports object
        let escapes = false;
        for (let [binding] of properties) {
          if (!createdObjects.has(binding.object)) escapes = true;
        }
        if (escapes) continue;

        this.initializedModules.set(moduleId, compl);
      }
    } finally {
      realm.popContext(context);
      realm.setReadOnly(oldReadOnly);
      this.delayUnsupportedRequires = oldDelayUnsupportedRequires;
    }
  }
}
