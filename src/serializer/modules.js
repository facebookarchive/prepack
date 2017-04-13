/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import { Reference } from "../environment.js";
import { GlobalEnvironmentRecord, DeclarativeEnvironmentRecord } from "../environment.js";
import { Realm, ExecutionContext, Tracer } from "../realm.js";
import type { Effects } from "../realm.js";
import { IsUnresolvableReference, ResolveBinding, ToStringPartial, Get } from "../methods/index.js";
import { Completion, AbruptCompletion, IntrospectionThrowCompletion } from "../completions.js";
import { Value, FunctionValue, ObjectValue, NumberValue, StringValue } from "../values/index.js";
import * as t from "babel-types";
import type { BabelNodeExpression, BabelNodeIdentifier, BabelNodeLVal, BabelNodeCallExpression } from "babel-types";
import invariant from "../invariant.js";
import { Logger } from "./logger.js";
import type { SerializationContext } from "../utils/generator.js";

class ModuleTracer extends Tracer {
  constructor(modules: Modules) {
    super();
    this.modules = modules;
    this.partialEvaluation = 0;
  }

  modules: Modules;
  partialEvaluation: number;

  beginPartialEvaluation() {
    this.partialEvaluation++;
  }

  endPartialEvaluation(effects: void | Effects) {
    this.partialEvaluation--;
  }

  beforeCall(F: FunctionValue, thisArgument: void | Value, argumentsList: Array<Value>, newTarget: void | ObjectValue) {
    if (F === this.modules.getDefine()) {
      if (this.partialEvaluation !== 0) this.modules.logger.logError("Defining a module in nested partial evaluation is not supported.");
      let factoryFunction = argumentsList[0];
      if (factoryFunction instanceof FunctionValue) this.modules.factoryFunctions.add(factoryFunction);
      else this.modules.logger.logError("First argument to define function is not a function value.");
      let moduleId = argumentsList[1];
      if (moduleId instanceof NumberValue || moduleId instanceof StringValue) this.modules.moduleIds.add(moduleId.value);
      else this.modules.logger.logError("Second argument to define function is not a number or string value.");
    }
  }
}


export class Modules {
  constructor(realm: Realm, logger: Logger) {
    this.realm = realm;
    this.logger = logger;
    this._require = realm.intrinsics.undefined;
    this._define = realm.intrinsics.undefined;
    this.factoryFunctions = new Set();
    this.moduleIds = new Set();
    this.initializedModules = new Map();
    realm.tracers.push(new ModuleTracer(this));
  }

  realm: Realm;
  logger: Logger;
  _require: Value;
  _define: Value;
  factoryFunctions: Set<FunctionValue>;
  moduleIds: Set<number | string>;
  initializedModules: Map<number | string, Value>;
  active: boolean;

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

  initializeMoreModules() {
    // partially evaluate all factory methods by calling require
    let realm = this.realm;
    // setup execution environment
    let context = new ExecutionContext();
    let env = realm.$GlobalEnv;
    context.lexicalEnvironment = env;
    context.variableEnvironment = env;
    context.realm = realm;
    realm.pushContext(context);
    try {
      let count = 0;
      let introspectionErrors = Object.create(null);
      for (let moduleId of this.moduleIds) {
        if (this.initializedModules.has(moduleId)) continue;

        let node = t.callExpression(t.identifier("require"), [t.valueToNode(moduleId)]);

        let [compl, gen, bindings, properties, createdObjects] =
          realm.partially_evaluate_node(node, true, env, false);

        if (compl instanceof Completion) {
          realm.restoreBindings(bindings);
          realm.restoreProperties(properties);
          if (compl instanceof IntrospectionThrowCompletion) {
            let value = compl.value;
            invariant(value instanceof ObjectValue);
            let message: string = this.logger.tryQuery(() => ToStringPartial(realm, Get(realm, ((value: any): ObjectValue), "message")), "(cannot get message)", false);
            if (compl.reason !== undefined) message = `[${compl.reason}] ${message}`;
            let stack: string = this.logger.tryQuery(() => ToStringPartial(realm, Get(realm, ((value: any): ObjectValue), "stack")), "", false);
            let i = stack.indexOf("\n");
            if (i >= 0) stack = stack.slice(i);
            realm.restoreBindings(bindings);
            realm.restoreProperties(properties);
            let stacks = introspectionErrors[message] = introspectionErrors[message] || [];
            stacks.push(stack);
            continue;
          }

          console.log(`=== UNEXPECTED ERROR during speculative initialization of module ${moduleId} ===`);
          this.logger.logCompletion(compl);
          realm.restoreBindings(bindings);
          realm.restoreProperties(properties);
          break;
        }

        invariant(compl instanceof Value);

        // Apply the joined effects to the global state
        realm.restoreBindings(bindings);
        realm.restoreProperties(properties);

        // Add generated code for property modifications
        let realmGenerator = this.realm.generator;
        invariant(realmGenerator);
        let first = true;
        for (let bodyEntry of gen.body) {
          let id = bodyEntry.declaresDerivedId;
          let originalBuildNode = bodyEntry.buildNode;
          let buildNode = originalBuildNode;
          if (first) {
            first = false;
            buildNode = (nodes, f) => {
              let n = originalBuildNode(nodes, f);
              n.leadingComments = [({ type: "BlockComment", value: `Speculative initialization of module ${moduleId}` }: any)];
              return n;
            };
          }
          realmGenerator.body.push({ declaresDerivedId: id, args: bodyEntry.args, buildNode: buildNode });
        }

        // Ignore created objects
        createdObjects;
        count++;
        this.initializedModules.set(moduleId, compl);
      }
      if (count > 0) console.log(`=== speculatively initialized ${count} additional modules`);
      let a = [];
      for (let key in introspectionErrors) a.push([introspectionErrors[key], key]);
      a.sort((x, y) => y[0].length - x[0].length);
      if (a.length) {
        console.log(`=== speculative module initialization failures ordered by frequency`);
        for (let [stacks, n] of a) console.log(`${stacks.length}x ${n} ${stacks.join("\nas well as")}]`);
      }
    } finally {
      realm.popContext(context);
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
    try {
      for (let moduleId of this.moduleIds) {
        let node = t.callExpression(t.identifier("require"), [t.valueToNode(moduleId)]);

        let [compl, gen, bindings, properties, createdObjects] =
          realm.partially_evaluate_node(node, true, env, false);
        // for lint unused
        invariant(bindings);

        if (compl instanceof AbruptCompletion) continue;
        invariant(compl instanceof Value);

        if (gen.body.length !== 0 ||
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
    }
  }
}
