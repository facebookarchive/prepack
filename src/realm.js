/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { Intrinsics, PropertyBinding, Descriptor, DebugServerType } from "./types.js";
import { CompilerDiagnostic, type ErrorHandlerResult, type ErrorHandler, FatalError } from "./errors.js";
import {
  AbstractObjectValue,
  AbstractValue,
  ConcreteValue,
  ECMAScriptSourceFunctionValue,
  FunctionValue,
  NativeFunctionValue,
  ObjectValue,
  ProxyValue,
  StringValue,
  SymbolValue,
  UndefinedValue,
  Value,
} from "./values/index.js";
import { LexicalEnvironment, Reference, GlobalEnvironmentRecord } from "./environment.js";
import type { Binding } from "./environment.js";
import {
  cloneDescriptor,
  composeGenerators,
  composePossiblyNormalCompletions,
  Construct,
  incorporateSavedCompletion,
  ToString,
  updatePossiblyNormalCompletionWithSubsequentEffects,
} from "./methods/index.js";
import { Completion, ThrowCompletion, AbruptCompletion, PossiblyNormalCompletion } from "./completions.js";
import type { Compatibility, RealmOptions } from "./options.js";
import invariant from "./invariant.js";
import seedrandom from "seedrandom";
import { Generator, PreludeGenerator } from "./utils/generator.js";
import { Properties } from "./singletons.js";
import type { BabelNode, BabelNodeSourceLocation, BabelNodeLVal, BabelNodeStatement } from "babel-types";
import * as t from "babel-types";

export type Bindings = Map<Binding, void | Value>;
export type EvaluationResult = Completion | Reference | Value;
export type PropertyBindings = Map<PropertyBinding, void | Descriptor>;

export type CreatedObjects = Set<ObjectValue>;
export type Effects = [EvaluationResult, Generator, Bindings, PropertyBindings, CreatedObjects];

export class Tracer {
  beginEvaluateForEffects(state: any) {}
  endEvaluateForEffects(state: any, effects: void | Effects) {}
  detourCall(
    F: FunctionValue,
    thisArgument: void | Value,
    argumentsList: Array<Value>,
    newTarget: void | ObjectValue,
    performCall: () => Value
  ): void | Value {}
  beforeCall(
    F: FunctionValue,
    thisArgument: void | Value,
    argumentsList: Array<Value>,
    newTarget: void | ObjectValue
  ) {}
  afterCall(
    F: FunctionValue,
    thisArgument: void | Value,
    argumentsList: Array<Value>,
    newTarget: void | ObjectValue,
    result: void | Reference | Value | AbruptCompletion
  ) {}
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
  isStrict: boolean;

  setCaller(context: ExecutionContext): void {
    this.caller = context;
  }

  setFunction(F: null | FunctionValue) {
    if (F instanceof ECMAScriptSourceFunctionValue) this.isStrict = F.$Strict;
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
    // TODO #712: suspend
  }

  resume(): Value {
    // TODO #712: resume
    return this.realm.intrinsics.undefined;
  }
}

export function construct_empty_effects(realm: Realm): Effects {
  return [realm.intrinsics.empty, new Generator(realm), new Map(), new Map(), new Set()];
}

export class Realm {
  constructor(opts: RealmOptions) {
    this.isReadOnly = false;
    this.useAbstractInterpretation = !!opts.serialize || !!opts.residual;
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
    this.maxStackDepth = opts.maxStackDepth || 225;
    this.omitInvariants = !!opts.omitInvariants;

    this.$TemplateMap = [];

    if (this.useAbstractInterpretation) {
      this.preludeGenerator = new PreludeGenerator(opts.debugNames, opts.uniqueSuffix);
      this.pathConditions = [];
      ObjectValue.setupTrackedPropertyAccessors(ObjectValue.trackedPropertyNames);
      ObjectValue.setupTrackedPropertyAccessors(NativeFunctionValue.trackedPropertyNames);
      ObjectValue.setupTrackedPropertyAccessors(ProxyValue.trackedPropertyNames);
    }

    this.tracers = [];

    // These get initialized in construct_realm to avoid the dependency
    this.intrinsics = ({}: any);
    this.$GlobalObject = (({}: any): ObjectValue);
    this.evaluators = (Object.create(null): any);
    this.partialEvaluators = (Object.create(null): any);
    this.$GlobalEnv = ((undefined: any): LexicalEnvironment);

    this.react = {
      enabled: opts.reactEnabled || false,
      flowRequired: true,
      reactElementSymbol: undefined,
    };

    this.errorHandler = opts.errorHandler;

    this.globalSymbolRegistry = [];
  }

  start: number;
  isReadOnly: boolean;
  isStrict: boolean;
  useAbstractInterpretation: boolean;
  timeout: void | number;
  mathRandomGenerator: void | (() => number);
  strictlyMonotonicDateNow: boolean;
  maxStackDepth: number;
  omitInvariants: boolean;

  modifiedBindings: void | Bindings;
  modifiedProperties: void | PropertyBindings;
  createdObjects: void | CreatedObjects;
  reportObjectGetOwnProperties: void | (ObjectValue => void);
  reportPropertyAccess: void | (PropertyBinding => void);
  savedCompletion: void | PossiblyNormalCompletion;

  // A list of abstract conditions that are known to be true in the current execution path.
  // For example, the abstract condition of an if statement is known to be true inside its true branch.
  pathConditions: Array<AbstractValue>;

  currentLocation: ?BabelNodeSourceLocation;
  nextContextLocation: ?BabelNodeSourceLocation;
  contextStack: Array<ExecutionContext> = [];
  $GlobalEnv: LexicalEnvironment;
  intrinsics: Intrinsics;

  react: {
    enabled: boolean,
    flowRequired: boolean,
    reactElementSymbol?: SymbolValue,
  };

  $GlobalObject: ObjectValue | AbstractObjectValue;
  compatibility: Compatibility;

  $TemplateMap: Array<{ $Strings: Array<string>, $Array: ObjectValue }>;

  generator: void | Generator;
  preludeGenerator: void | PreludeGenerator;
  timeoutCounter: number;
  timeoutCounterThreshold: number;
  evaluators: {
    [key: string]: (
      ast: BabelNode,
      strictCode: boolean,
      env: LexicalEnvironment,
      realm: Realm,
      metadata?: any
    ) => Value | Reference,
  };
  partialEvaluators: {
    [key: string]: (
      ast: BabelNode,
      strictCode: boolean,
      env: LexicalEnvironment,
      realm: Realm,
      metadata?: any
    ) => [Completion | Reference | Value, BabelNode, Array<BabelNodeStatement>],
  };
  simplifyAndRefineAbstractValue: AbstractValue => Value;
  simplifyAndRefineAbstractCondition: AbstractValue => Value;

  tracers: Array<Tracer>;

  MOBILE_JSC_VERSION = "jsc-600-1-4-17";

  errorHandler: ?ErrorHandler;
  objectCount = 0;
  symbolCount = 867501803871088;
  // Unique tag for identifying function body ast node. It is neeeded
  // instead of ast node itself because we may perform ast tree deep clone
  // during serialization which changes the ast identity.
  functionBodyUniqueTagSeed = 1;

  globalSymbolRegistry: Array<{ $Key: string, $Symbol: SymbolValue }>;

  debuggerInstance: DebugServerType | void;

  nextGeneratorId: number = 0;

  // to force flow to type the annotations
  isCompatibleWith(compatibility: Compatibility): boolean {
    return compatibility === this.compatibility;
  }

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
    this.contextStack.forEach(ctx => {
      ctx.setReadOnly(readOnlyValue);
    });
  }

  testTimeout() {
    let timeout = this.timeout;
    if (timeout && !--this.timeoutCounter) {
      this.timeoutCounter = this.timeoutCounterThreshold;
      let total = Date.now() - this.start;
      if (total > timeout) {
        throw new FatalError("Timed out");
      }
    }
  }

  getRunningContext(): ExecutionContext {
    let context = this.contextStack[this.contextStack.length - 1];
    invariant(context, "There's no running execution context");
    return context;
  }

  pushContext(context: ExecutionContext): void {
    if (this.contextStack.length >= this.maxStackDepth) {
      throw new FatalError("Maximum stack depth exceeded");
    }
    this.contextStack.push(context);
  }

  popContext(context: ExecutionContext): void {
    let modifiedBindings = this.modifiedBindings;
    if (modifiedBindings !== undefined) {
      for (let b of modifiedBindings.keys()) {
        if (b.environment.$FunctionObject === context.function) modifiedBindings.delete(b);
      }
    }
    let c = this.contextStack.pop();
    invariant(c === context);
  }

  wrapInGlobalEnv<T>(callback: () => T): T {
    let context = new ExecutionContext();
    context.isStrict = this.isStrict;
    context.lexicalEnvironment = this.$GlobalEnv;
    context.variableEnvironment = this.$GlobalEnv;
    context.realm = this;

    this.pushContext(context);
    try {
      return callback();
    } finally {
      this.popContext(context);
    }
  }

  assignToGlobal(name: BabelNodeLVal, value: Value) {
    this.wrapInGlobalEnv(() => this.$GlobalEnv.assignToGlobal(name, value));
  }

  deleteGlobalBinding(name: string) {
    this.$GlobalEnv.environmentRecord.DeleteBinding(name);
  }

  // Evaluate the given ast in a sandbox and return the evaluation results
  // in the form of a completion, a code generator, a map of changed variable
  // bindings and a map of changed property bindings.
  evaluateNodeForEffects(ast: BabelNode, strictCode: boolean, env: LexicalEnvironment, state?: any): Effects {
    return this.evaluateForEffects(() => env.evaluateCompletionDeref(ast, strictCode), state);
  }

  evaluateAndRevertInGlobalEnv(func: () => Value): void {
    this.wrapInGlobalEnv(() => this.evaluateForEffects(func));
  }

  evaluateNodeForEffectsInGlobalEnv(node: BabelNode, state?: any): Effects {
    return this.wrapInGlobalEnv(() => this.evaluateNodeForEffects(node, false, this.$GlobalEnv, state));
  }

  partiallyEvaluateNodeForEffects(
    ast: BabelNode,
    strictCode: boolean,
    env: LexicalEnvironment
  ): [Effects, BabelNode, Array<BabelNodeStatement>] {
    let nodeAst, nodeIO;
    function partialEval() {
      let result;
      [result, nodeAst, nodeIO] = env.partiallyEvaluateCompletionDeref(ast, strictCode);
      return result;
    }
    let effects = this.evaluateForEffects(partialEval);
    invariant(nodeAst !== undefined && nodeIO !== undefined);
    return [effects, nodeAst, nodeIO];
  }

  evaluateForEffects(f: () => Completion | Value, state: any): Effects {
    // Save old state and set up empty state for ast
    let [savedBindings, savedProperties] = this.getAndResetModifiedMaps();
    let saved_generator = this.generator;
    let saved_createdObjects = this.createdObjects;
    let saved_completion = this.savedCompletion;
    this.generator = new Generator(this);
    this.createdObjects = new Set();
    this.savedCompletion = undefined; // while in this call, we only explore the normal path.

    let result;
    try {
      for (let t1 of this.tracers) t1.beginEvaluateForEffects(state);

      let c;
      try {
        c = f();
        // This is join point for the normal branch of a PossiblyNormalCompletion.
        if (c instanceof Value || c instanceof AbruptCompletion) c = incorporateSavedCompletion(this, c);
        invariant(c !== undefined);
        if (c instanceof PossiblyNormalCompletion) {
          // The current state may have advanced since the time control forked into the various paths recorded in c.
          // Update the normal path and restore the global state to what it was at the time of the fork.
          let subsequentEffects = this.getCapturedEffects(c, c.value);
          invariant(subsequentEffects !== undefined);
          this.stopEffectCaptureAndUndoEffects(c);
          updatePossiblyNormalCompletionWithSubsequentEffects(this, c, subsequentEffects);
          this.savedCompletion = undefined;
        }

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
        if (this.savedCompletion !== undefined) this.stopEffectCaptureAndUndoEffects(this.savedCompletion);
        if (result !== undefined) {
          this.restoreBindings(result[2]);
          this.restoreProperties(result[3]);
        } else {
          this.restoreBindings(this.modifiedBindings);
          this.restoreProperties(this.modifiedProperties);
        }
        this.generator = saved_generator;
        this.modifiedBindings = savedBindings;
        this.modifiedProperties = savedProperties;
        this.createdObjects = saved_createdObjects;
        this.savedCompletion = saved_completion;
      }
    } finally {
      for (let t2 of this.tracers) t2.endEvaluateForEffects(state, result);
    }
  }

  composeEffects(priorEffects: Effects, subsequentEffects: Effects): Effects {
    let [, pg, pb, pp, po] = priorEffects;
    let [sc, sg, sb, sp, so] = subsequentEffects;
    let result = construct_empty_effects(this);
    let [, , rb, rp, ro] = result;

    result[0] = sc;

    result[1] = composeGenerators(this, pg || result[1], sg);

    if (pb) {
      pb.forEach((val, key, m) => rb.set(key, val));
    }
    sb.forEach((val, key, m) => rb.set(key, val));

    if (pp) {
      pp.forEach((desc, propertyBinding, m) => rp.set(propertyBinding, desc));
    }
    sp.forEach((val, key, m) => rp.set(key, val));

    if (po) {
      po.forEach((ob, a) => ro.add(ob));
    }
    so.forEach((ob, a) => ro.add(ob));

    return result;
  }

  updateAbruptCompletions(priorEffects: Effects, c: PossiblyNormalCompletion) {
    if (c.consequent instanceof AbruptCompletion) {
      c.consequentEffects = this.composeEffects(priorEffects, c.consequentEffects);
      let alternate = c.alternate;
      if (alternate instanceof PossiblyNormalCompletion) this.updateAbruptCompletions(priorEffects, alternate);
    } else {
      invariant(c.alternate instanceof AbruptCompletion);
      c.alternateEffects = this.composeEffects(priorEffects, c.alternateEffects);
      let consequent = c.consequent;
      if (consequent instanceof PossiblyNormalCompletion) this.updateAbruptCompletions(priorEffects, consequent);
    }
  }

  composeWithSavedCompletion(completion: PossiblyNormalCompletion): Value {
    if (this.savedCompletion === undefined) {
      this.savedCompletion = completion;
      this.captureEffects(completion);
    } else {
      this.savedCompletion = composePossiblyNormalCompletions(this, this.savedCompletion, completion);
    }
    return completion.value;
  }

  captureEffects(completion: PossiblyNormalCompletion) {
    if (completion.savedEffects !== undefined) {
      // Already called captureEffects, just carry on
      return;
    }
    completion.savedEffects = [
      this.intrinsics.undefined,
      (this.generator: any),
      (this.modifiedBindings: any),
      (this.modifiedProperties: any),
      (this.createdObjects: any),
    ];
    this.generator = new Generator(this);
    this.modifiedBindings = new Map();
    this.modifiedProperties = new Map();
    this.createdObjects = new Set();
  }

  getCapturedEffects(completion: PossiblyNormalCompletion, v?: Value): void | Effects {
    if (completion.savedEffects === undefined) return undefined;
    if (v === undefined) v = this.intrinsics.undefined;
    invariant(this.generator !== undefined);
    invariant(this.modifiedBindings !== undefined);
    invariant(this.modifiedProperties !== undefined);
    invariant(this.createdObjects !== undefined);
    return [v, this.generator, this.modifiedBindings, this.modifiedProperties, this.createdObjects];
  }

  stopEffectCapture(completion: PossiblyNormalCompletion) {
    let e = this.getCapturedEffects(completion);
    if (e !== undefined) {
      this.stopEffectCaptureAndUndoEffects(completion);
      this.applyEffects(e);
    }
  }

  stopEffectCaptureAndUndoEffects(completion: PossiblyNormalCompletion) {
    // Roll back the state changes
    this.restoreBindings(this.modifiedBindings);
    this.restoreProperties(this.modifiedProperties);

    // Restore saved state
    if (completion.savedEffects !== undefined) {
      let [c, g, b, p, o] = completion.savedEffects;
      c;
      completion.savedEffects = undefined;
      this.generator = g;
      this.modifiedBindings = b;
      this.modifiedProperties = p;
      this.createdObjects = o;
    } else {
      invariant(false);
    }
  }

  // Apply the given effects to the global state
  applyEffects(effects: Effects, leadingComment: string = "") {
    let [, generator, bindings, properties, createdObjects] = effects;

    // Add generated code for property modifications
    this.appendGenerator(generator, leadingComment);

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
      if (realmCreatedObjects === undefined) this.createdObjects = new Set(createdObjects);
      else {
        createdObjects.forEach((ob, a) => {
          invariant(realmCreatedObjects !== undefined);
          realmCreatedObjects.add(ob);
        });
      }
    }
  }

  outputToConsole(method: "log" | "warn" | "error", args: Array<string | ConcreteValue>): void {
    if (this.isReadOnly) {
      // This only happens during speculative execution and is reported elsewhere
      throw new FatalError("Trying to create console output in read-only realm");
    }
    if (this.useAbstractInterpretation) {
      invariant(this.generator !== undefined);
      this.generator.emitConsoleLog(method, args);
    } else {
      console[method](getString(this, args));
    }

    function getString(realm: Realm, values: Array<string | ConcreteValue>) {
      let res = "";
      while (values.length) {
        let next = values.shift();
        let nextString = ToString(realm, next);
        res += nextString;
      }
      return res;
    }
  }

  // Record the current value of binding in this.modifiedBindings unless
  // there is already an entry for binding.
  recordModifiedBinding(binding: Binding): Binding {
    if (binding.environment.isReadOnly) {
      // This only happens during speculative execution and is reported elsewhere
      throw new FatalError("Trying to modify a binding in read-only realm");
    }
    if (this.modifiedBindings !== undefined && !this.modifiedBindings.has(binding))
      this.modifiedBindings.set(binding, binding.value);
    return binding;
  }

  callReportObjectGetOwnProperties(ob: ObjectValue): void {
    if (this.reportObjectGetOwnProperties !== undefined) {
      this.reportObjectGetOwnProperties(ob);
    }
  }

  callReportPropertyAccess(binding: PropertyBinding): void {
    if (this.reportPropertyAccess !== undefined) {
      this.reportPropertyAccess(binding);
    }
  }

  // Record the current value of binding in this.modifiedProperties unless
  // there is already an entry for binding.
  recordModifiedProperty(binding: void | PropertyBinding): void {
    if (binding === undefined) return;
    if (this.isReadOnly && (this.getRunningContext().isReadOnly || !this.isNewObject(binding.object))) {
      // This only happens during speculative execution and is reported elsewhere
      throw new FatalError("Trying to modify a property in read-only realm");
    }
    this.callReportPropertyAccess(binding);
    if (this.modifiedProperties !== undefined && !this.modifiedProperties.has(binding)) {
      this.modifiedProperties.set(binding, cloneDescriptor(binding.descriptor));
    }
  }

  isNewObject(object: AbstractObjectValue | ObjectValue): boolean {
    if (object instanceof AbstractObjectValue) return false;
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
    modifiedProperties.forEach((desc, propertyBinding, m) => {
      let d = propertyBinding.descriptor;
      propertyBinding.descriptor = desc;
      m.set(propertyBinding, d);
    });
  }

  // Provide the realm with maps in which to track modifications.
  // A map can be set to undefined if no tracking is required.
  setModifiedMaps(modifiedBindings: void | Bindings, modifiedProperties: void | PropertyBindings) {
    this.modifiedBindings = modifiedBindings;
    this.modifiedProperties = modifiedProperties;
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

  rebuildNestedProperties(abstractValue: AbstractValue | UndefinedValue, path: string) {
    if (!(abstractValue instanceof AbstractObjectValue)) return;
    if (abstractValue.values.isTop()) return;
    let template = abstractValue.getTemplate();
    invariant(!template.intrinsicName || template.intrinsicName === path);
    // TODO #882: We are using the concept of "intrinsic values" to mark the template
    // object as intrinsic, so that we'll never emit code that creates it, as it instead is used
    // to refer to an unknown but existing object.
    // However, it's not really an intrinsic object, and it might not exist ahead of time, but only starting
    // from this point on, which might be tied to some nested generator.
    // Which we currently don't track, and that needs to get fixed.
    // For now, we use intrinsicNameGenerated to mark this case.
    template.intrinsicName = path;
    template.intrinsicNameGenerated = true;
    for (let [key, binding] of template.properties) {
      if (binding === undefined || binding.descriptor === undefined) continue; // deleted
      invariant(binding.descriptor !== undefined);
      let value = binding.descriptor.value;
      Properties.ThrowIfMightHaveBeenDeleted(value);
      if (value === undefined) {
        AbstractValue.reportIntrospectionError(abstractValue, key);
        throw new FatalError();
      }
      invariant(value instanceof Value);
      this.rebuildObjectProperty(abstractValue, key, value, path);
    }
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

  reportIntrospectionError(message?: void | string | StringValue) {
    if (message === undefined) message = "";
    if (typeof message === "string") message = new StringValue(this, message);
    invariant(message instanceof StringValue);
    this.nextContextLocation = this.currentLocation;
    let error = new CompilerDiagnostic(message.value, this.currentLocation, "PP0001", "FatalError");
    this.handleError(error);
  }

  createErrorThrowCompletion(type: NativeFunctionValue, message?: void | string | StringValue): ThrowCompletion {
    invariant(type !== this.intrinsics.__IntrospectionError);
    if (message === undefined) message = "";
    if (typeof message === "string") message = new StringValue(this, message);
    invariant(message instanceof StringValue);
    this.nextContextLocation = this.currentLocation;
    return new ThrowCompletion(Construct(this, type, [message]), this.currentLocation);
  }

  appendGenerator(generator: Generator, leadingComment: string = ""): void {
    let realmGenerator = this.generator;
    if (realmGenerator === undefined) {
      invariant(generator.empty());
      return;
    }
    realmGenerator.appendGenerator(generator, leadingComment);
  }

  // Pass the error to the realm's error-handler
  // Return value indicates whether the caller should try to recover from the
  // error or not ('true' means recover if possible).
  handleError(diagnostic: CompilerDiagnostic): ErrorHandlerResult {
    if (!diagnostic.callStack && this.contextStack.length > 0) {
      let error = Construct(this, this.intrinsics.Error);
      let stack = error.$Get("stack", error);
      if (stack instanceof StringValue) diagnostic.callStack = stack.value;
    }
    // Default behaviour is to bail on the first error
    let errorHandler = this.errorHandler;
    if (!errorHandler) {
      let msg = `${diagnostic.errorCode}: ${diagnostic.message}`;
      if (diagnostic.location) {
        let loc_start = diagnostic.location.start;
        let loc_end = diagnostic.location.end;
        msg += ` at ${loc_start.line}:${loc_start.column} to ${loc_end.line}:${loc_end.column}`;
      }
      try {
        switch (diagnostic.severity) {
          case "Information":
            console.log(`Info: ${msg}`);
            return "Recover";
          case "Warning":
            console.warn(`Warn: ${msg}`);
            return "Recover";
          case "RecoverableError":
            console.error(`Error: ${msg}`);
            return "Fail";
          case "FatalError":
            console.error(`Fatal Error: ${msg}`);
            return "Fail";
          default:
            invariant(false, "Unexpected error type");
        }
      } finally {
        console.log(diagnostic.callStack);
      }
    }
    return errorHandler(diagnostic);
  }
}
