/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { RealmOptions, Intrinsics, Compatibility, PropertyBinding, Descriptor } from "./types.js";
import type { NativeFunctionValue, FunctionValue } from "./values/index.js";
import { Value, ObjectValue, AbstractValue, AbstractObjectValue, StringValue } from "./values/index.js";
import { TypesDomain, ValuesDomain } from "./domains/index.js";
import { initialize as initializeIntrinsics } from "./intrinsics/index.js";
import { LexicalEnvironment, Reference, GlobalEnvironmentRecord } from "./environment.js";
import type { Binding } from "./environment.js";
import { cloneDescriptor, GetValue, NewGlobalEnvironment, Construct, ThrowIfMightHaveBeenDeleted } from "./methods/index.js";
import type { NormalCompletion } from "./completions.js";
import { Completion, IntrospectionThrowCompletion, ThrowCompletion, AbruptCompletion } from "./completions.js";
import invariant from "./invariant.js";
import initializeGlobal from "./global.js";
import seedrandom from "seedrandom";
import { Generator, PreludeGenerator } from "./utils/generator.js";
import type { BabelNode, BabelNodeSourceLocation, BabelNodeExpression } from "babel-types";
import type { EnvironmentRecord } from "./environment.js";
import * as t from "babel-types";
import * as evaluators from "./evaluators/index.js";

export type Bindings = Map<Binding, void | Value>;
export type EvaluationResult = Completion | Reference | Value;
export type PropertyBindings = Map<PropertyBinding, void | Descriptor>;

export type CreatedObjects = Set<ObjectValue | AbstractObjectValue>;
export type Effects = [EvaluationResult, Generator, Bindings, PropertyBindings, CreatedObjects];

export class Tracer {
  beginPartialEvaluation() {}
  endPartialEvaluation(effects: void | Effects) {}
  beforeCall(F: FunctionValue, thisArgument: void | Value, argumentsList: Array<Value>, newTarget: void | ObjectValue) {}
  afterCall(F: FunctionValue, thisArgument: void | Value, argumentsList: Array<Value>, newTarget: void | ObjectValue, result: void | Reference | Value | AbruptCompletion) {}
}

export class ExecutionContext {
  function: ?FunctionValue;
  caller: ?ExecutionContext;
  loc: ?BabelNodeSourceLocation;
  ScriptOrModule: any;
  realm: Realm;
  variableEnvironment: LexicalEnvironment;
  lexicalEnvironment: LexicalEnvironment;
  isReadOnly: boolean;
  savedEffects: void | Effects;

  setCaller(context: ExecutionContext): void {
    this.caller = context;
  }

  setFunction(F: null | FunctionValue) {
    this.function = F;
  }

  setLocation(loc: null | BabelNodeSourceLocation) {
    if (!loc) return;
    this.loc = loc;
  }

  setRealm(realm: Realm): void {
    this.realm = realm;
  }

  /*
   Read-only envs disallow:
   - creating bindings in their scope
   - creating or modifying objects when they are current running context
  */
  setReadOnly(value: boolean): boolean {
    let oldReadOnly = this.isReadOnly;
    if (this.variableEnvironment) this.variableEnvironment.environmentRecord.isReadOnly = value;
    if (this.lexicalEnvironment) this.lexicalEnvironment.environmentRecord.isReadOnly = value;
    this.isReadOnly = value;
    return oldReadOnly;
  }

  suspend(): void {
    // TODO: suspend
  }

  resume(): void {
    // TODO: resume
  }
}

export function construct_empty_effects(realm: Realm): Effects {
  return [realm.intrinsics.empty, new Generator(realm), new Map(), new Map(), new Set()];
}

export class Realm {
  constructor(opts: RealmOptions = {}) {
    this.isReadOnly = false;
    this.isPartial  = !!opts.partial;
    if (opts.mathRandomSeed !== undefined) {
      this.mathRandomGenerator = seedrandom(opts.mathRandomSeed);
    }
    this.strictlyMonotonicDateNow = !!opts.strictlyMonotonicDateNow;

    this.timeout = opts.timeout;
    if (this.timeout) {
      // We'll call Date.now for every this.timeoutCounterThreshold'th AST node.
      // The threshold is there to reduce the cost of the surprisingly expensive Date.now call.
      this.timeoutCounter = this.timeoutCounterThreshold = 1024;
    }

    this.start = Date.now();
    this.compatibility = opts.compatibility || "browser";

    let i = this.intrinsics = ({}: any);
    initializeIntrinsics(i, this);

    this.$GlobalObject = initializeGlobal(this);
    this.$GlobalEnv    = NewGlobalEnvironment(this, this.$GlobalObject, this.$GlobalObject);
    this.$TemplateMap  = [];

    if (this.isPartial) {
      this.preludeGenerator = new PreludeGenerator();
      this.generator        = new Generator(this);
      ObjectValue.setupTrackedPropertyAccessors();
    }

    this.evaluators = Object.create(null);
    for (let name in evaluators) this.evaluators[name] = evaluators[name];

    this.annotations = new Map();
    this.tracers = [];
  }

  start: number;
  isReadOnly: boolean;
  isPartial: boolean;
  timeout: void | number;
  mathRandomGenerator: void | () => number;
  strictlyMonotonicDateNow: boolean;

  modifiedBindings: void | Bindings;
  modifiedProperties: void | PropertyBindings;

  createdObjects: void | CreatedObjects;

  currentLocation: ?BabelNodeSourceLocation;
  nextContextLocation: ?BabelNodeSourceLocation;
  contextStack: Array<ExecutionContext> = [];
  $GlobalEnv: LexicalEnvironment;
  intrinsics: Intrinsics;

  $GlobalObject: ObjectValue | AbstractObjectValue;
  compatibility: Compatibility;

  $TemplateMap: Array<{$Strings: Array<string>, $Array: ObjectValue}>;

  generator: void | Generator;
  preludeGenerator: void | PreludeGenerator;
  timeoutCounter: number;
  timeoutCounterThreshold: number;
  evaluators: { [key: string]: (ast: BabelNode, strictCode: boolean, env: LexicalEnvironment, realm: Realm, metadata?: any) => NormalCompletion | Value | Reference };

  annotations: Map<FunctionValue, string>;
  tracers: Array<Tracer>;

  // Checks if there is a let binding at global scope with the given name
  // returning it if so
  getGlobalLetBinding(key: string): void | Value {
    let globrec = this.$GlobalEnv.environmentRecord;
    // GlobalEnv should have a GlobalEnvironmentRecord
    invariant(globrec instanceof GlobalEnvironmentRecord);
    let dclrec = globrec.$DeclarativeRecord;

    return dclrec.HasBinding(key) ? dclrec.GetBindingValue(key, false) : undefined;
  }

  /*
   Read only realms disallow:
   - using console.log
   - creating bindings in any existing scopes
   - modifying object properties in any existing scopes
   Setting a realm read-only sets all contained environments to read-only, but
   all new environments (e.g. new ExecutionContexts) will be writeable.
   */
  setReadOnly(readOnlyValue: boolean) {
    this.isReadOnly = readOnlyValue;
    this.$GlobalEnv.environmentRecord.isReadOnly = readOnlyValue;
    this.contextStack.forEach((ctx) => {
      ctx.setReadOnly(readOnlyValue);
    });
  }

  testTimeout() {
    let timeout = this.timeout;
    if (timeout && !--this.timeoutCounter) {
      this.timeoutCounter = this.timeoutCounterThreshold;
      let total = Date.now() - this.start;
      if (total > timeout) {
        throw new Error("Timed out");
      }
    }
  }

  getRunningContext(): ExecutionContext {
    let context = this.contextStack[this.contextStack.length - 1];
    invariant(context, "There's no running execution context");
    return context;
  }

  pushContext(context: ExecutionContext): void {
    this.contextStack.push(context);
  }

  popContext(context: ExecutionContext): void {
    let c = this.contextStack.pop();
    invariant(c === context);
  }

  // Evaluate the given ast in a sandbox and return the evaluation results
  // in the form a completion, a code generator, a map of changed variable
  // bindings and a map of changed property bindings.
  partially_evaluate_node(ast: BabelNode, strictCode: boolean, env: LexicalEnvironment): Effects {
    return this.partially_evaluate(() => env.evaluateCompletion(ast, strictCode));
  }

  partially_evaluate(f: () => Completion | Value | Reference): Effects {
    // Save old state and set up empty state for ast
    let [savedBindings, savedProperties] = this.getAndResetModifiedMaps();
    let saved_generator = this.generator;
    let saved_createdObjects = this.createdObjects;
    this.generator = new Generator(this);
    this.createdObjects = new Set();

    for (let t1 of this.tracers) t1.beginPartialEvaluation();

    let c;
    let result;
    try {
      c = f();
      if (c instanceof Reference) c = GetValue(this, c);

      invariant(this.generator !== undefined);
      invariant(this.modifiedBindings !== undefined);
      invariant(this.modifiedProperties !== undefined);
      invariant(this.createdObjects !== undefined);
      let astGenerator = this.generator;
      let astBindings = this.modifiedBindings;
      let astProperties = this.modifiedProperties;
      let astCreatedObjects = this.createdObjects;

      // Return the captured state changes and evaluation result
      result = [c, astGenerator, astBindings, astProperties, astCreatedObjects];
      return result;
    } finally {
      // Roll back the state changes
      this.restoreBindings(this.modifiedBindings);
      this.restoreProperties(this.modifiedProperties);
      this.generator = saved_generator;
      this.modifiedBindings = savedBindings;
      this.modifiedProperties = savedProperties;
      this.createdObjects = saved_createdObjects;

      for (let t2 of this.tracers) t2.endPartialEvaluation(result);
    }
  }

  capture_effects() {
    let context = this.getRunningContext();
    if (context.savedEffects !== undefined) {
      // Already called capture_effects in this context, just carry on
      return;
    }
    context.savedEffects = [this.intrinsics.undefined, this.generator,
      this.modifiedBindings, this.modifiedProperties, this.createdObjects];
    this.generator = new Generator(this);
    this.modifiedBindings = new Map();
    this.modifiedProperties = new Map();
    this.createdObjects = new Set();
  }

  get_captured_effects(v?: Value): void | Effects {
    let context = this.getRunningContext();
    if (context.savedEffects === undefined) return undefined;
    if (v === undefined) v = this.intrinsics.undefined;
    invariant(this.generator !== undefined);
    invariant(this.modifiedBindings !== undefined);
    invariant(this.modifiedProperties !== undefined);
    invariant(this.createdObjects !== undefined);
    return [v, this.generator, this.modifiedBindings,
       this.modifiedProperties, this.createdObjects];
  }

  stop_effect_capture() {
    let context = this.getRunningContext();
    if (context.savedEffects !== undefined) {
      let [c, g, b, p, o] = context.savedEffects;
      c;
      context.savedEffects = undefined;
      this.generator = g;
      this.modifiedBindings = b;
      this.modifiedProperties = p;
      this.createdObjects = o;
    }
  }

  // Apply the given effects to the global state
  apply_effects(effects: Effects) {
    let [completion, generator, bindings, properties, createdObjects] = effects;

    // ignore completion
    completion;

    // Add generated code for property modifications
    let realmGenerator = this.generator;
    invariant(realmGenerator);
    let realmGeneratorBody = realmGenerator.body;
    generator.body.forEach((v, k, a) => realmGeneratorBody.push(v));

    // Restore bindings
    this.restoreBindings(bindings);
    this.restoreProperties(properties);

    // track bindings
    let realmModifiedBindings = this.modifiedBindings;
    if (realmModifiedBindings !== undefined) {
      bindings.forEach((val, key, m) => {
        invariant(realmModifiedBindings !== undefined);
        if (!realmModifiedBindings.has(key)) {
          realmModifiedBindings.set(key, val);
        }
      });
    }
    let realmModifiedProperties = this.modifiedProperties;
    if (realmModifiedProperties !== undefined) {
      properties.forEach((desc, propertyBinding, m) => {
        invariant(realmModifiedProperties !== undefined);
        if (!realmModifiedProperties.has(propertyBinding)) {
          realmModifiedProperties.set(propertyBinding, desc);
        }
      });
    }

    // add created objects
    if (createdObjects.size > 0) {
      let realmCreatedObjects = this.createdObjects;
      if (realmCreatedObjects === undefined)
        this.createdObjects = new Set(createdObjects);
      else {
        createdObjects.forEach((ob, a) => {
          invariant(realmCreatedObjects !== undefined);
          realmCreatedObjects.add(ob);
        });
      }
    }
  }

  throwReadOnlyError(msg: string) {
    let completion = this.createErrorThrowCompletion(this.intrinsics.__IntrospectionError, msg);
    invariant(completion instanceof IntrospectionThrowCompletion);
    completion.reason = "readonly";
    throw completion;
  }

  outputToConsole(str: string): void {
    if (this.isReadOnly) this.throwReadOnlyError("Trying to create console output in read-only realm");
    if (this.isPartial) {
      invariant(this.generator !== undefined);
      this.generator.emitConsoleLog(str);
    } else {
      console.log(str);
    }
  }

  // Record the current value of binding in this.modifiedBindings unless
  // there is already an entry for binding.
  recordModifiedBinding(binding: Binding, env: EnvironmentRecord): Binding {
    if (env.isReadOnly) this.throwReadOnlyError("Trying to modify a binding in read-only realm");
    if (this.modifiedBindings !== undefined && !this.modifiedBindings.has(binding))
      this.modifiedBindings.set(binding, binding.value);
    return binding;
  }

  // Record the current value of binding in this.modifiedProperties unless
  // there is already an entry for binding.
  recordModifiedProperty(binding: PropertyBinding): void {
    if (this.isReadOnly && (this.getRunningContext().isReadOnly || !this.isNewObject(binding.object))) {
      this.throwReadOnlyError("Trying to modify a property in read-only realm");
    }
    if (this.modifiedProperties !== undefined && !this.modifiedProperties.has(binding)) {
      this.modifiedProperties.set(binding, cloneDescriptor(binding.descriptor));
    }
  }

  isNewObject(object: AbstractObjectValue | ObjectValue): boolean {
    if (object instanceof AbstractObjectValue) {
      let realm = this;
      return object.values.getElements().some(element => realm.isNewObject(element));
    }
    return this.createdObjects === undefined || this.createdObjects.has(object);
  }

  recordNewObject(object: ObjectValue): void {
    if (this.createdObjects !== undefined) {
      this.createdObjects.add(object);
    }
  }

  // Returns the current values of modifiedBindings and modifiedProperties
  // and then assigns new empty maps to them.
  getAndResetModifiedMaps(): [void | Bindings, void | PropertyBindings] {
    let result = [this.modifiedBindings, this.modifiedProperties];
    this.modifiedBindings = new Map();
    this.modifiedProperties = new Map();
    return result;
  }

  // Restores each Binding in the given map to the value it
  // had when it was entered into the map and updates the map to record
  // the value the Binding had just before the call to this method.
  restoreBindings(modifiedBindings: void | Bindings) {
    if (modifiedBindings === undefined) return;
    modifiedBindings.forEach((val, key, m) => {
      let v = key.value;
      key.value = val;
      m.set(key, v);
    });
  }

  // Restores each PropertyBinding in the given map to the value it
  // had when it was entered into the map and updates the map to record
  // the value the Binding had just before the call to this method.
  restoreProperties(modifiedProperties: void | PropertyBindings) {
    if (modifiedProperties === undefined) return;
    modifiedProperties.forEach(
      (desc, propertyBinding, m) => {
        let d = propertyBinding.descriptor;
        propertyBinding.descriptor = desc;
        m.set(propertyBinding, d);
      });
  }

  // Provide the realm with maps in which to track modifications.
  // A map can be set to undefined if no tracking is required.
  setModifiedMaps(modifiedBindings: void | Bindings,
      modifiedProperties: void | PropertyBindings) {
    this.modifiedBindings = modifiedBindings;
    this.modifiedProperties = modifiedProperties;
  }

  // creates an abstract value
  createAbstract(types: TypesDomain, values: ValuesDomain, args: Array<Value>, buildNode: (Array<BabelNodeExpression> => BabelNodeExpression) | BabelNodeExpression, kind?: string, intrinsicName?: string) {
    invariant(this.isPartial);
    let Constructor = types.getType() === ObjectValue ? AbstractObjectValue : AbstractValue;
    return new Constructor(this, types, values, args, buildNode, kind, intrinsicName);
  }

  rebuildObjectProperty(object: Value, key: string, propertyValue: Value, path: string) {
    if (!(propertyValue instanceof AbstractValue)) return;
    if (!propertyValue.isIntrinsic()) {
      propertyValue.intrinsicName = `${path}.${key}`;
      propertyValue.args = [object];
      propertyValue._buildNode = ([node]) => t.memberExpression(node, t.identifier(key));
      this.rebuildNestedProperties(propertyValue, propertyValue.intrinsicName);
    }
  }

  rebuildNestedProperties(abstractValue: AbstractValue, path: string) {
    if (!(abstractValue instanceof AbstractObjectValue)) return;
    let template = abstractValue.getTemplate();
    invariant(!template.intrinsicName || template.intrinsicName === path);
    template.intrinsicName = path;
    for (let [key, binding] of template.properties) {
      if (binding === undefined || binding.descriptor === undefined) continue; // deleted
      invariant(binding.descriptor !== undefined);
      let value = binding.descriptor.value;
      ThrowIfMightHaveBeenDeleted(value);
      if (value === undefined) return AbstractValue.throwIntrospectionError(abstractValue, key);
      this.rebuildObjectProperty(abstractValue, key, value, path);
    }
  }

  deriveAbstract(types: TypesDomain, values: ValuesDomain, args: Array<Value>, buildNode: (Array<BabelNodeExpression> => BabelNodeExpression) | BabelNodeExpression, kind?: string): AbstractValue {
    invariant(this.isPartial);
    let generator = this.generator;
    invariant(generator);
    return generator.derive(types, values, args, buildNode, kind);
  }

  createExecutionContext(): ExecutionContext {
    let context = new ExecutionContext();

    let loc = this.nextContextLocation;
    if (loc) {
      context.setLocation(loc);
      this.nextContextLocation = null;
    }

    return context;
  }

  setNextExecutionContextLocation(loc: ?BabelNodeSourceLocation) {
    if (!loc) return;

    //if (this.nextContextLocation) {
    //  throw new ThrowCompletion(
    //    Construct(this, this.intrinsics.TypeError, [new StringValue(this, "Already have a context location that we haven't used yet")])
    //  );
    //} else {
    this.nextContextLocation = loc;
    //}
  }

  createErrorThrowCompletion(type: NativeFunctionValue, message?: void | string | StringValue): ThrowCompletion {
    if (message === undefined) message = "TODO";
    if (typeof message === "string") message = new StringValue(this, message);
    invariant(message instanceof StringValue);
    this.nextContextLocation = this.currentLocation;
    if (type === this.intrinsics.__IntrospectionError)
      return new IntrospectionThrowCompletion(Construct(this, type, [message]));
    return new ThrowCompletion(Construct(this, type, [message]));
  }
}
