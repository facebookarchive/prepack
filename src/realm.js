/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { Intrinsics, PropertyBinding, Descriptor } from "./types.js";
import { CompilerDiagnostic, type ErrorHandlerResult, type ErrorHandler, FatalError } from "./errors.js";
import type { NativeFunctionValue, FunctionValue } from "./values/index.js";
import {
  Value,
  ObjectValue,
  AbstractValue,
  AbstractObjectValue,
  StringValue,
  ConcreteValue,
  UndefinedValue,
} from "./values/index.js";
import { TypesDomain, ValuesDomain } from "./domains/index.js";
import { LexicalEnvironment, Reference, GlobalEnvironmentRecord } from "./environment.js";
import type { Binding } from "./environment.js";
import { cloneDescriptor, GetValue, Construct, ThrowIfMightHaveBeenDeleted } from "./methods/index.js";
import type { NormalCompletion } from "./completions.js";
import { Completion, ThrowCompletion, AbruptCompletion, PossiblyNormalCompletion } from "./completions.js";
import type { Compatibility, RealmOptions } from "./options.js";
import invariant from "./invariant.js";
import seedrandom from "seedrandom";
import { Generator, PreludeGenerator } from "./utils/generator.js";
import type { BabelNode, BabelNodeSourceLocation, BabelNodeStatement, BabelNodeExpression } from "babel-types";
import type { EnvironmentRecord } from "./environment.js";
import * as t from "babel-types";
import { ToString } from "./methods/to.js";

export type Bindings = Map<Binding, void | Value>;
export type EvaluationResult = Completion | Reference | Value;
export type PropertyBindings = Map<PropertyBinding, void | Descriptor>;

export type CreatedObjects = Set<ObjectValue | AbstractObjectValue>;
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
  savedEffects: void | Effects;
  savedCompletion: void | PossiblyNormalCompletion;

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

  resume(): Value {
    // TODO: resume
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

    this.$TemplateMap = [];

    if (this.useAbstractInterpretation) {
      this.preludeGenerator = new PreludeGenerator(opts.debugNames, opts.uniqueSuffix);
      ObjectValue.setupTrackedPropertyAccessors();
    }

    this.tracers = [];

    // These get initialized in construct_realm to avoid the dependency
    this.intrinsics = ({}: any);
    this.$GlobalObject = (({}: any): ObjectValue);
    this.evaluators = (Object.create(null): any);
    this.partialEvaluators = (Object.create(null): any);
    this.$GlobalEnv = ((undefined: any): LexicalEnvironment);

    this.errorHandler = opts.errorHandler;
  }

  start: number;
  isReadOnly: boolean;
  useAbstractInterpretation: boolean;
  timeout: void | number;
  mathRandomGenerator: void | (() => number);
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
    ) => NormalCompletion | Value | Reference,
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

  tracers: Array<Tracer>;

  MOBILE_JSC_VERSION = "jsc-600-1-4-17";

  errorHandler: ?ErrorHandler;

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
    this.contextStack.push(context);
  }

  popContext(context: ExecutionContext): void {
    let c = this.contextStack.pop();
    invariant(c === context);
    let savedEffects = context.savedEffects;
    if (savedEffects !== undefined && this.contextStack.length > 0) {
      // when unwinding the stack after a fatal error, saved effects are not incorporated into completions
      // and thus must be propogated to the calling context.
      let ctx = this.getRunningContext();
      if (ctx.savedEffects !== undefined) this.addPriorEffects(ctx.savedEffects, savedEffects);
      ctx.savedEffects = savedEffects;
    }
  }

  // Evaluate the given ast in a sandbox and return the evaluation results
  // in the form of a completion, a code generator, a map of changed variable
  // bindings and a map of changed property bindings.
  evaluateNodeForEffects(ast: BabelNode, strictCode: boolean, env: LexicalEnvironment): Effects {
    return this.evaluateForEffects(() => env.evaluateAbstractCompletion(ast, strictCode));
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

  evaluateForEffects(f: () => Completion | Value | Reference, state: any): Effects {
    // Save old state and set up empty state for ast
    let context = this.getRunningContext();
    let savedContextEffects = context.savedEffects;
    context.savedEffects = undefined;
    let [savedBindings, savedProperties] = this.getAndResetModifiedMaps();
    let saved_generator = this.generator;
    let saved_createdObjects = this.createdObjects;
    this.generator = new Generator(this);
    this.createdObjects = new Set();

    for (let t1 of this.tracers) t1.beginEvaluateForEffects(state);

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
      if (c instanceof PossiblyNormalCompletion) {
        let savedEffects = context.savedEffects;
        if (savedEffects !== undefined) {
          // add prior effects that are not already present
          this.addPriorEffects(savedEffects, result);
          this.updateAbruptCompletions(savedEffects, c);
          context.savedEffects = undefined;
        }
      }
      return result;
    } finally {
      // Roll back the state changes
      if (context.savedEffects !== undefined) {
        this.stopEffectCaptureAndUndoEffects();
      }
      this.restoreBindings(this.modifiedBindings);
      this.restoreProperties(this.modifiedProperties);
      context.savedEffects = savedContextEffects;
      this.generator = saved_generator;
      this.modifiedBindings = savedBindings;
      this.modifiedProperties = savedProperties;
      this.createdObjects = saved_createdObjects;

      for (let t2 of this.tracers) t2.endEvaluateForEffects(state, result);
    }
  }

  addPriorEffects(priorEffects: Effects, subsequentEffects: Effects) {
    let [pc, pg, pb, pp, po] = priorEffects;
    let [sc, sg, sb, sp, so] = subsequentEffects;

    pc;
    sc;

    let saved_generator = this.generator;
    this.generator = pg.clone();
    this.appendGenerator(sg);
    subsequentEffects[1] = pg;
    this.generator = saved_generator;

    pb.forEach((val, key, m) => {
      if (!sb.has(key)) sb.set(key, val);
    });

    pp.forEach((desc, propertyBinding, m) => {
      if (!sp.has(propertyBinding)) sp.set(propertyBinding, desc);
    });

    po.forEach((ob, a) => {
      so.add(ob);
    });
  }

  updateAbruptCompletions(priorEffects: Effects, c: PossiblyNormalCompletion) {
    if (c.consequent instanceof AbruptCompletion) {
      this.addPriorEffects(priorEffects, c.consequentEffects);
      let alternate = c.alternate;
      if (alternate instanceof PossiblyNormalCompletion) this.updateAbruptCompletions(priorEffects, alternate);
    } else {
      invariant(c.alternate instanceof AbruptCompletion);
      this.addPriorEffects(priorEffects, c.alternateEffects);
      let consequent = c.consequent;
      if (consequent instanceof PossiblyNormalCompletion) this.updateAbruptCompletions(priorEffects, consequent);
    }
  }

  captureEffects() {
    let context = this.getRunningContext();
    if (context.savedEffects !== undefined) {
      // Already called captureEffects in this context, just carry on
      return;
    }
    context.savedEffects = [
      this.intrinsics.undefined,
      this.generator,
      this.modifiedBindings,
      this.modifiedProperties,
      this.createdObjects,
    ];
    this.generator = new Generator(this);
    this.modifiedBindings = new Map();
    this.modifiedProperties = new Map();
    this.createdObjects = new Set();
  }

  getCapturedEffects(v?: Value): void | Effects {
    let context = this.getRunningContext();
    if (context.savedEffects === undefined) return undefined;
    if (v === undefined) v = this.intrinsics.undefined;
    invariant(this.generator !== undefined);
    invariant(this.modifiedBindings !== undefined);
    invariant(this.modifiedProperties !== undefined);
    invariant(this.createdObjects !== undefined);
    return [v, this.generator, this.modifiedBindings, this.modifiedProperties, this.createdObjects];
  }

  stopEffectCaptureAndUndoEffects() {
    // Roll back the state changes
    this.restoreBindings(this.modifiedBindings);
    this.restoreProperties(this.modifiedProperties);

    // Restore saved state
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
  applyEffects(effects: Effects, leadingComment: string = "") {
    let [completion, generator, bindings, properties, createdObjects] = effects;

    // ignore completion
    completion;

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
  recordModifiedBinding(binding: Binding, env: EnvironmentRecord): Binding {
    if (env.isReadOnly) {
      // This only happens during speculative execution and is reported elsewhere
      throw new FatalError("Trying to modify a binding in read-only realm");
    }
    if (this.modifiedBindings !== undefined && !this.modifiedBindings.has(binding))
      this.modifiedBindings.set(binding, binding.value);
    return binding;
  }

  // Record the current value of binding in this.modifiedProperties unless
  // there is already an entry for binding.
  recordModifiedProperty(binding: PropertyBinding): void {
    if (this.isReadOnly && (this.getRunningContext().isReadOnly || !this.isNewObject(binding.object))) {
      // This only happens during speculative execution and is reported elsewhere
      throw new FatalError("Trying to modify a property in read-only realm");
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

  // Create a state-less abstract value.
  // NOTE: `buildNode` MUST NOT create an AST which may mutate or access mutable state! Use `deriveAbstract` for that purpose.
  createAbstract(
    types: TypesDomain,
    values: ValuesDomain,
    args: Array<Value>,
    buildNode: ((Array<BabelNodeExpression>) => BabelNodeExpression) | BabelNodeExpression,
    kind?: string,
    intrinsicName?: string
  ) {
    invariant(this.useAbstractInterpretation);
    let Constructor = Value.isTypeCompatibleWith(types.getType(), ObjectValue) ? AbstractObjectValue : AbstractValue;
    return new Constructor(this, types, values, args, buildNode, { kind, intrinsicName });
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
    let template = abstractValue.getTemplate();
    invariant(!template.intrinsicName || template.intrinsicName === path);
    template.intrinsicName = path;
    for (let [key, binding] of template.properties) {
      if (binding === undefined || binding.descriptor === undefined) continue; // deleted
      invariant(binding.descriptor !== undefined);
      let value = binding.descriptor.value;
      ThrowIfMightHaveBeenDeleted(value);
      if (value === undefined) {
        AbstractValue.reportIntrospectionError(abstractValue, key);
        throw new FatalError();
      }
      this.rebuildObjectProperty(abstractValue, key, value, path);
    }
  }

  // Create a an abstract value in a way that may observe or mutate state.
  // NOTE: If the state that is observed or mutated by the AST generated by `buildNode` is also represented in some form in the interpreter,
  // i.e. not just external state, then the caller must make sure that all relevant interpreter state is updated correspondingly.
  deriveAbstract(
    types: TypesDomain,
    values: ValuesDomain,
    args: Array<Value>,
    buildNode: ((Array<BabelNodeExpression>) => BabelNodeExpression) | BabelNodeExpression,
    optionalArgs?: {| kind?: string, isPure?: boolean |}
  ): AbstractValue | UndefinedValue {
    invariant(this.useAbstractInterpretation);
    let generator = this.generator;
    invariant(generator);
    if (types.getType() === UndefinedValue) {
      return generator.emitVoidExpression(types, values, args, buildNode);
    } else {
      return generator.derive(types, values, args, buildNode, optionalArgs);
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
    if (message === undefined) message = "TODO";
    if (typeof message === "string") message = new StringValue(this, message);
    invariant(message instanceof StringValue);
    this.nextContextLocation = this.currentLocation;
    let error = new CompilerDiagnostic(message.value, this.currentLocation, "PP0001", "FatalError");
    this.handleError(error);
  }

  createErrorThrowCompletion(type: NativeFunctionValue, message?: void | string | StringValue): ThrowCompletion {
    invariant(type !== this.intrinsics.__IntrospectionError);
    if (message === undefined) message = "TODO";
    if (typeof message === "string") message = new StringValue(this, message);
    invariant(message instanceof StringValue);
    this.nextContextLocation = this.currentLocation;
    return new ThrowCompletion(Construct(this, type, [message]));
  }

  appendGenerator(generator: Generator, leadingComment: string = ""): void {
    let generatorBody = generator.body;
    let realmGenerator = this.generator;
    if (realmGenerator === undefined) {
      invariant(generatorBody.length === 0);
      return;
    }
    let realmGeneratorBody = realmGenerator.body;
    let i = 0;
    if (generatorBody.length > 0 && leadingComment.length > 0) {
      let firstEntry = generatorBody[i++];
      let buildNode = (nodes, f) => {
        let n = firstEntry.buildNode(nodes, f);
        n.leadingComments = [({ type: "BlockComment", value: leadingComment }: any)];
        return n;
      };
      realmGeneratorBody.push({
        declaresDerivedId: firstEntry.declaresDerivedId,
        args: firstEntry.args,
        buildNode: buildNode,
      });
    }
    for (; i < generatorBody.length; i++) realmGeneratorBody.push(generatorBody[i]);
  }

  // Pass the error to the realm's error-handler
  // Return value indicates whether the caller should try to recover from the
  // error or not ('true' means recover if possible).
  handleError(diagnostic: CompilerDiagnostic): ErrorHandlerResult {
    // Default behaviour is to bail on the first error
    let errorHandler = this.errorHandler;
    if (!errorHandler) {
      let msg = `${diagnostic.errorCode}: ${diagnostic.message}`;
      if (diagnostic.location) {
        let loc_start = diagnostic.location.start;
        let loc_end = diagnostic.location.end;
        msg += ` at ${loc_start.line}:${loc_start.column} to ${loc_end.line}:${loc_end.column}`;
      }
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
    }
    return errorHandler(diagnostic);
  }
}
