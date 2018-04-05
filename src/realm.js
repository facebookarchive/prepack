/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type {
  RealmTimingStatistics,
  Intrinsics,
  PropertyBinding,
  Descriptor,
  DebugServerType,
  ClassComponentMetadata,
  ReactHint,
} from "./types.js";
import { RealmStatistics } from "./types.js";
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
import type { TypesDomain, ValuesDomain } from "./domains/index.js";
import {
  LexicalEnvironment,
  Reference,
  GlobalEnvironmentRecord,
  FunctionEnvironmentRecord,
  DeclarativeEnvironmentRecord,
} from "./environment.js";
import type { Binding } from "./environment.js";
import { cloneDescriptor, Construct } from "./methods/index.js";
import {
  AbruptCompletion,
  Completion,
  JoinedAbruptCompletions,
  PossiblyNormalCompletion,
  ThrowCompletion,
} from "./completions.js";
import type { Compatibility, RealmOptions, ReactOutputTypes } from "./options.js";
import invariant from "./invariant.js";
import seedrandom from "seedrandom";
import { Generator, PreludeGenerator } from "./utils/generator.js";
import { emptyExpression, voidExpression } from "./utils/internalizer.js";
import { Environment, Functions, Join, Properties, To, Widen, Path } from "./singletons.js";
import type { ReactSymbolTypes } from "./react/utils.js";
import type { BabelNode, BabelNodeSourceLocation, BabelNodeLVal, BabelNodeStatement } from "babel-types";
import * as t from "babel-types";

export type BindingEntry = { hasLeaked: boolean, value: void | Value };
export type Bindings = Map<Binding, BindingEntry>;
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
  return [realm.intrinsics.empty, new Generator(realm, "construct_empty_effects"), new Map(), new Map(), new Set()];
}

export class Realm {
  constructor(opts: RealmOptions) {
    this.statistics = new RealmStatistics();
    this.isReadOnly = false;
    this.useAbstractInterpretation = !!opts.serialize || !!opts.residual || !!opts.check;
    this.ignoreLeakLogic = false;
    this.isInPureTryStatement = false;
    if (opts.mathRandomSeed !== undefined) {
      this.mathRandomGenerator = seedrandom(opts.mathRandomSeed);
    }
    this.strictlyMonotonicDateNow = !!opts.strictlyMonotonicDateNow;

    // 0 = disabled
    this.abstractValueImpliesMax = opts.abstractValueImpliesMax || 0;
    this.abstractValueImpliesCounter = 0;
    this.inSimplificationPath = false;

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
    this.emitConcreteModel = !!opts.emitConcreteModel;

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
      abstractHints: new WeakMap(),
      classComponentMetadata: new Map(),
      currentOwner: undefined,
      enabled: opts.reactEnabled || false,
      output: opts.reactOutput || "create-element",
      hoistableFunctions: new WeakMap(),
      hoistableReactElements: new WeakMap(),
      reactElements: new WeakSet(),
      symbols: new Map(),
      verbose: opts.reactVerbose || false,
    };

    this.alreadyDescribedLocations = new WeakMap();
    this.stripFlow = opts.stripFlow || false;

    this.fbLibraries = {
      other: new Map(),
      react: undefined,
      reactRelay: undefined,
    };

    this.errorHandler = opts.errorHandler;

    this.globalSymbolRegistry = [];
    this.activeLexicalEnvironments = new Set();
    this._abstractValuesDefined = new Set(); // A set of nameStrings to ensure abstract values have unique names
    this.debugNames = opts.debugNames;
  }

  statistics: RealmStatistics;
  timingStatistics: void | RealmTimingStatistics;
  start: number;
  isReadOnly: boolean;
  isStrict: boolean;
  useAbstractInterpretation: boolean;
  debugNames: void | boolean;
  isInPureTryStatement: boolean; // TODO(1264): Remove this once we implement proper exception handling in abstract calls.
  timeout: void | number;
  mathRandomGenerator: void | (() => number);
  strictlyMonotonicDateNow: boolean;
  maxStackDepth: number;
  omitInvariants: boolean;
  ignoreLeakLogic: boolean;
  emitConcreteModel: boolean;

  abstractValueImpliesMax: number;
  abstractValueImpliesCounter: number;
  inSimplificationPath: boolean;

  modifiedBindings: void | Bindings;
  modifiedProperties: void | PropertyBindings;
  createdObjects: void | CreatedObjects;
  createdObjectsTrackedForLeaks: void | CreatedObjects;
  reportObjectGetOwnProperties: void | (ObjectValue => void);
  reportPropertyAccess: void | (PropertyBinding => void);
  savedCompletion: void | PossiblyNormalCompletion;

  activeLexicalEnvironments: Set<LexicalEnvironment>;

  // A list of abstract conditions that are known to be true in the current execution path.
  // For example, the abstract condition of an if statement is known to be true inside its true branch.
  pathConditions: Array<AbstractValue>;

  currentLocation: ?BabelNodeSourceLocation;
  nextContextLocation: ?BabelNodeSourceLocation;
  contextStack: Array<ExecutionContext> = [];
  $GlobalEnv: LexicalEnvironment;
  intrinsics: Intrinsics;

  react: {
    // reactHints are generated to help improve the effeciency of the React reconciler when
    // operating on a tree of React components. We can use reactHint to mark AbstractValues
    // with extra data that helps us traverse through the tree that would otherwise not be possible
    // (for example, when we use Relay's React containers with "fb-www" – which are AbstractObjectValues,
    // we need to know what React component was passed to this AbstractObjectValue so we can visit it next)
    abstractHints: WeakMap<AbstractValue | ObjectValue, ReactHint>,
    classComponentMetadata: Map<ECMAScriptSourceFunctionValue, ClassComponentMetadata>,
    currentOwner?: ObjectValue,
    enabled: boolean,
    hoistableFunctions: WeakMap<FunctionValue, boolean>,
    hoistableReactElements: WeakMap<ObjectValue, boolean>,
    output?: ReactOutputTypes,
    reactElements: WeakSet<ObjectValue>,
    symbols: Map<ReactSymbolTypes, SymbolValue>,
    verbose: boolean,
  };
  alreadyDescribedLocations: WeakMap<FunctionValue, string | void>;
  stripFlow: boolean;

  fbLibraries: {
    other: Map<string, AbstractValue>,
    react: void | ObjectValue,
    reactRelay: void | ObjectValue,
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
  _abstractValuesDefined: Set<string>;

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

    try {
      return dclrec.HasBinding(key) ? dclrec.GetBindingValue(key, false) : undefined;
    } catch (e) {
      if (e instanceof FatalError) return undefined;
      throw e;
    }
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

  hasRunningContext(): boolean {
    return this.contextStack.length !== 0;
  }

  getRunningContext(): ExecutionContext {
    let context = this.contextStack[this.contextStack.length - 1];
    invariant(context, "There's no running execution context");
    return context;
  }

  clearBlockBindings(modifiedBindings: void | Bindings, environmentRecord: DeclarativeEnvironmentRecord) {
    if (modifiedBindings === undefined) return;
    for (let b of modifiedBindings.keys())
      if (environmentRecord.bindings[b.name] && environmentRecord.bindings[b.name] === b) modifiedBindings.delete(b);
  }

  clearBlockBindingsFromCompletion(completion: Completion, environmentRecord: DeclarativeEnvironmentRecord) {
    if (completion instanceof PossiblyNormalCompletion) {
      this.clearBlockBindings(completion.alternateEffects[2], environmentRecord);
      this.clearBlockBindings(completion.consequentEffects[2], environmentRecord);
      if (completion.savedEffects !== undefined) this.clearBlockBindings(completion.savedEffects[2], environmentRecord);
      if (completion.alternate instanceof Completion)
        this.clearBlockBindingsFromCompletion(completion.alternate, environmentRecord);
      if (completion.consequent instanceof Completion)
        this.clearBlockBindingsFromCompletion(completion.consequent, environmentRecord);
    } else if (completion instanceof JoinedAbruptCompletions) {
      this.clearBlockBindings(completion.alternateEffects[2], environmentRecord);
      this.clearBlockBindings(completion.consequentEffects[2], environmentRecord);
      if (completion.alternate instanceof Completion)
        this.clearBlockBindingsFromCompletion(completion.alternate, environmentRecord);
      if (completion.consequent instanceof Completion)
        this.clearBlockBindingsFromCompletion(completion.consequent, environmentRecord);
    }
  }

  // Call when a scope falls out of scope and should be destroyed.
  // Clears the Bindings corresponding to the disappearing Scope from ModifiedBindings
  onDestroyScope(lexicalEnvironment: LexicalEnvironment) {
    invariant(this.activeLexicalEnvironments.has(lexicalEnvironment));
    let modifiedBindings = this.modifiedBindings;
    if (modifiedBindings) {
      // Don't undo things to global scope because it's needed past its destruction point (for serialization)
      let environmentRecord = lexicalEnvironment.environmentRecord;
      if (environmentRecord instanceof DeclarativeEnvironmentRecord) {
        this.clearBlockBindings(modifiedBindings, environmentRecord);
        if (this.savedCompletion !== undefined)
          this.clearBlockBindingsFromCompletion(this.savedCompletion, environmentRecord);
      }
    }

    // Ensures if we call onDestroyScope too early, there will be a failure.
    this.activeLexicalEnvironments.delete(lexicalEnvironment);
    lexicalEnvironment.destroy();
  }

  pushContext(context: ExecutionContext): void {
    if (this.contextStack.length >= this.maxStackDepth) {
      throw new FatalError("Maximum stack depth exceeded");
    }
    this.contextStack.push(context);
  }

  clearFunctionBindings(modifiedBindings: void | Bindings, funcVal: FunctionValue) {
    if (modifiedBindings === undefined) return;
    for (let b of modifiedBindings.keys()) {
      if (b.environment instanceof FunctionEnvironmentRecord && b.environment.$FunctionObject === funcVal)
        modifiedBindings.delete(b);
    }
  }

  clearFunctionBindingsFromCompletion(completion: Completion, funcVal: FunctionValue) {
    if (completion instanceof PossiblyNormalCompletion) {
      this.clearFunctionBindings(completion.alternateEffects[2], funcVal);
      this.clearFunctionBindings(completion.consequentEffects[2], funcVal);
      if (completion.savedEffects !== undefined) this.clearFunctionBindings(completion.savedEffects[2], funcVal);
      if (completion.alternate instanceof Completion)
        this.clearFunctionBindingsFromCompletion(completion.alternate, funcVal);
      if (completion.consequent instanceof Completion)
        this.clearFunctionBindingsFromCompletion(completion.consequent, funcVal);
    } else if (completion instanceof JoinedAbruptCompletions) {
      this.clearFunctionBindings(completion.alternateEffects[2], funcVal);
      this.clearFunctionBindings(completion.consequentEffects[2], funcVal);
      if (completion.alternate instanceof Completion)
        this.clearFunctionBindingsFromCompletion(completion.alternate, funcVal);
      if (completion.consequent instanceof Completion)
        this.clearFunctionBindingsFromCompletion(completion.consequent, funcVal);
    }
  }

  popContext(context: ExecutionContext): void {
    let funcVal = context.function;
    if (funcVal) {
      this.clearFunctionBindings(this.modifiedBindings, funcVal);
      if (this.savedCompletion !== undefined) this.clearFunctionBindingsFromCompletion(this.savedCompletion, funcVal);
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

  // Evaluate a context as if it won't have any side-effects outside of any objects
  // that it created itself. This promises that any abstract functions inside of it
  // also won't have effects on any objects or bindings that weren't created in this
  // call.
  evaluatePure<T>(f: () => T) {
    let saved_createdObjectsTrackedForLeaks = this.createdObjectsTrackedForLeaks;
    // Track all objects (including function closures) created during
    // this call. This will be used to make the assumption that every
    // *other* object is unchanged (pure). These objects are marked
    // as leaked if they're passed to abstract functions.
    this.createdObjectsTrackedForLeaks = new Set();
    try {
      return f();
    } finally {
      this.createdObjectsTrackedForLeaks = saved_createdObjectsTrackedForLeaks;
    }
  }

  isInPureScope() {
    return !!this.createdObjectsTrackedForLeaks;
  }

  evaluateWithoutLeakLogic(f: () => Value): Value {
    invariant(!this.ignoreLeakLogic, "Nesting evaluateWithoutLeakLogic() calls is not supported.");
    this.ignoreLeakLogic = true;
    try {
      return f();
    } finally {
      this.ignoreLeakLogic = false;
    }
  }

  // Evaluate some code that might generate temporal values knowing that it might end in an abrupt
  // completion. We only need to support ThrowCompletion for now but this can be expanded to support other
  // abrupt completions.
  evaluateWithPossibleThrowCompletion(f: () => Value, thrownTypes: TypesDomain, thrownValues: ValuesDomain): Value {
    // The cases when we need this are only when we might invoke unknown code such as abstract
    // funtions, getters, custom coercion etc. It is possible we can use this in other cases
    // where something might throw a built-in error but can never issue arbitrary code such as
    // calling something that might not be a function. For now we only use it in pure functions.
    invariant(this.isInPureScope(), "only abstract abrupt completion in pure functions");

    // TODO(1264): We should create a new generator for this scope and wrap it in a try/catch.
    // We could use the outcome of that as the join condition for a PossiblyNormalCompletion.
    // We should then compose that with the saved completion and move on to the normal route.
    // Currently we just issue a recoverable error instead if this might matter.
    let value = f();
    if (this.isInPureTryStatement) {
      let diag = new CompilerDiagnostic(
        "Possible throw inside try/catch is not yet supported",
        this.currentLocation,
        "PP0021",
        "RecoverableError"
      );
      if (this.handleError(diag) !== "Recover") throw new FatalError();
    }
    return value;
  }

  // Evaluate the given ast in a sandbox and return the evaluation results
  // in the form of a completion, a code generator, a map of changed variable
  // bindings and a map of changed property bindings.
  evaluateNodeForEffects(
    ast: BabelNode,
    strictCode: boolean,
    env: LexicalEnvironment,
    state?: any,
    generatorName?: string
  ): Effects {
    return this.evaluateForEffects(
      () => env.evaluateCompletionDeref(ast, strictCode),
      state,
      generatorName || "evaluateNodeForEffects"
    );
  }

  evaluateForEffectsInGlobalEnv(func: () => Value, state?: any, generatorName?: string): Effects {
    return this.wrapInGlobalEnv(() =>
      this.evaluateForEffects(func, state, generatorName || "evaluateForEffectsInGlobalEnv")
    );
  }

  // NB: does not apply generators because there's no way to cleanly revert them.
  // func should not return undefined
  withEffectsAppliedInGlobalEnv<T>(func: Effects => T, effects: Effects): T {
    let result: T;
    this.evaluateForEffectsInGlobalEnv(() => {
      try {
        this.applyEffects(effects, "", false);
        result = func(effects);
        return this.intrinsics.undefined;
      } finally {
        this.restoreBindings(effects[2]);
        this.restoreProperties(effects[3]);
      }
    });
    invariant(result !== undefined, "If we get here, func must have returned undefined.");
    return result;
  }

  evaluateNodeForEffectsInGlobalEnv(node: BabelNode, state?: any, generatorName?: string): Effects {
    return this.wrapInGlobalEnv(() => this.evaluateNodeForEffects(node, false, this.$GlobalEnv, state, generatorName));
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
    let effects = this.evaluateForEffects(partialEval, undefined, "partiallyEvaluateNodeForEffects");
    invariant(nodeAst !== undefined && nodeIO !== undefined);
    return [effects, nodeAst, nodeIO];
  }

  evaluateForEffects(f: () => Completion | Value, state: any, generatorName: string): Effects {
    // Save old state and set up empty state for ast
    let [savedBindings, savedProperties] = this.getAndResetModifiedMaps();
    let saved_generator = this.generator;
    let saved_createdObjects = this.createdObjects;
    let saved_completion = this.savedCompletion;
    this.generator = new Generator(this, generatorName);
    this.createdObjects = new Set();
    this.savedCompletion = undefined; // while in this call, we only explore the normal path.

    let result;
    try {
      for (let t1 of this.tracers) t1.beginEvaluateForEffects(state);

      let c;
      try {
        try {
          c = f();
          if (c instanceof Reference) c = Environment.GetValue(this, c);
        } catch (e) {
          if (e instanceof AbruptCompletion) c = e;
          else throw e;
        }
        // This is a join point for the normal branch of a PossiblyNormalCompletion.
        if (c instanceof Value || c instanceof AbruptCompletion) c = Functions.incorporateSavedCompletion(this, c);
        invariant(c !== undefined);
        if (c instanceof PossiblyNormalCompletion) {
          // The current state may have advanced since the time control forked into the various paths recorded in c.
          // Update the normal path and restore the global state to what it was at the time of the fork.
          let subsequentEffects = this.getCapturedEffects(c, c.value);
          invariant(subsequentEffects !== undefined);
          this.stopEffectCaptureAndUndoEffects(c);
          Join.updatePossiblyNormalCompletionWithSubsequentEffects(this, c, subsequentEffects);
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

        /* TODO #1615: The following invariant should hold.

        // Check invariant that modified bindings to not refer to environment record belonging to
        // newly created closure objects.
        for (let binding of astBindings.keys())
          if (binding.environment instanceof FunctionEnvironmentRecord)
            invariant(!astCreatedObjects.has(binding.environment.$FunctionObject));
        */

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

  evaluateWithUndo(f: () => Value, defaultValue: Value = this.intrinsics.undefined): Value {
    if (!this.useAbstractInterpretation) return f();
    let oldErrorHandler = this.errorHandler;
    this.errorHandler = d => {
      if (d.severity === "Information" || d.severity === "Warning") return "Recover";
      return "Fail";
    };
    try {
      let effects = this.evaluateForEffects(
        () => {
          try {
            return f();
          } catch (e) {
            if (e instanceof Completion) {
              return defaultValue;
            } else if (e instanceof FatalError) {
              return defaultValue;
            } else {
              throw e;
            }
          }
        },
        undefined,
        "evaluateWithUndo"
      );
      return effects[0] instanceof Value ? effects[0] : defaultValue;
    } finally {
      this.errorHandler = oldErrorHandler;
    }
  }

  evaluateWithUndoForDiagnostic(f: () => Value): CompilerDiagnostic | Value {
    if (!this.useAbstractInterpretation) return f();
    let savedHandler = this.errorHandler;
    let diagnostic;
    try {
      this.errorHandler = d => {
        diagnostic = d;
        return "Fail";
      };
      let effects = this.evaluateForEffects(f, undefined, "evaluateWithUndoForDiagnostic");
      this.applyEffects(effects);
      let resultVal = effects[0];
      if (resultVal instanceof AbruptCompletion) throw resultVal;
      if (resultVal instanceof PossiblyNormalCompletion) {
        // in this case one of the branches may complete abruptly, which means that
        // not all control flow branches join into one flow at this point.
        // Consequently we have to continue tracking changes until the point where
        // all the branches come together into one.
        resultVal = this.composeWithSavedCompletion(resultVal);
      }
      invariant(resultVal instanceof Value);
      return resultVal;
    } catch (e) {
      if (diagnostic !== undefined) return diagnostic;
      throw e;
    } finally {
      this.errorHandler = savedHandler;
    }
  }

  evaluateForFixpointEffects(
    loopContinueTest: () => Value,
    loopBody: () => EvaluationResult
  ): void | [Effects, Effects] {
    try {
      let effects1 = this.evaluateForEffects((loopBody: any), undefined, "evaluateForFixpointEffects/1");
      while (true) {
        this.restoreBindings(effects1[2]);
        this.restoreProperties(effects1[3]);
        let effects2 = this.evaluateForEffects(
          () => {
            let test = loopContinueTest();
            if (!(test instanceof AbstractValue)) throw new FatalError("loop terminates before fixed point");
            return (loopBody(): any);
          },
          undefined,
          "evaluateForFixpointEffects/2"
        );
        this.restoreBindings(effects1[2]);
        this.restoreProperties(effects1[3]);
        if (Widen.containsEffects(effects1, effects2)) {
          // effects1 includes every value present in effects2, so doing another iteration using effects2 will not
          // result in any more values being added to abstract domains and hence a fixpoint has been reached.
          // Generate code using effects2 because its expressions have not been widened away.
          let [, gen, bindings2, pbindings2, createdObjects2] = effects2;
          this._applyPropertiesToNewlyCreatedObjects(pbindings2, createdObjects2);
          this._emitPropertAssignments(gen, pbindings2, createdObjects2);
          this._emitLocalAssignments(gen, bindings2, createdObjects2);
          return [effects1, effects2];
        }
        effects1 = Widen.widenEffects(this, effects1, effects2);
      }
    } catch (e) {
      return undefined;
    }
  }

  _applyPropertiesToNewlyCreatedObjects(
    modifiedProperties: void | PropertyBindings,
    newlyCreatedObjects: CreatedObjects
  ) {
    if (modifiedProperties === undefined) return;
    modifiedProperties.forEach((desc, propertyBinding, m) => {
      if (propertyBinding.object instanceof ObjectValue && newlyCreatedObjects.has(propertyBinding.object)) {
        propertyBinding.descriptor = desc;
      }
    });
  }

  // populate the loop body generator with assignments that will update the phiNodes
  _emitLocalAssignments(gen: Generator, bindings: Bindings, newlyCreatedObjects: CreatedObjects) {
    let tvalFor: Map<any, AbstractValue> = new Map();
    bindings.forEach((binding, key, map) => {
      let val = binding.value;
      if (val instanceof AbstractValue) {
        invariant(val._buildNode !== undefined);
        let tval = gen.derive(val.types, val.values, [val], ([n]) => n, {
          skipInvariant: true,
        });
        tvalFor.set(key, tval);
      }
    });
    bindings.forEach((binding, key, map) => {
      let val = binding.value;
      if (val instanceof AbstractValue) {
        let phiNode = key.phiNode;
        let tval = tvalFor.get(key);
        invariant(tval !== undefined);
        gen.emitStatement([tval], ([v]) => {
          invariant(phiNode !== undefined);
          let id = phiNode.buildNode([]);
          return t.expressionStatement(t.assignmentExpression("=", (id: any), v));
        });
      }

      if (val instanceof ObjectValue && newlyCreatedObjects.has(val)) {
        let phiNode = key.phiNode;
        gen.emitStatement([val], ([v]) => {
          invariant(phiNode !== undefined);
          let id = phiNode.buildNode([]);
          return t.expressionStatement(t.assignmentExpression("=", (id: any), v));
        });
      }
    });
  }

  // populate the loop body generator with assignments that will update properties modified inside the loop
  _emitPropertAssignments(gen: Generator, pbindings: PropertyBindings, newlyCreatedObjects: CreatedObjects) {
    function isSelfReferential(value: Value, pathNode: void | AbstractValue): boolean {
      if (value === pathNode) return true;
      if (value instanceof AbstractValue && pathNode !== undefined) {
        for (let v of value.args) {
          if (isSelfReferential(v, pathNode)) return true;
        }
      }
      return false;
    }

    let tvalFor: Map<any, AbstractValue> = new Map();
    pbindings.forEach((val, key, map) => {
      if (key.object instanceof ObjectValue && newlyCreatedObjects.has(key.object)) {
        return;
      }
      let value = val && val.value;
      if (value instanceof AbstractValue) {
        invariant(value._buildNode !== undefined);
        let tval = gen.derive(
          value.types,
          value.values,
          [key.object, value],
          ([o, n]) => {
            invariant(value instanceof Value);
            if (typeof key.key === "string" && value.mightHaveBeenDeleted() && isSelfReferential(value, key.pathNode)) {
              let inTest = t.binaryExpression("in", t.stringLiteral(key.key), o);
              let addEmpty = t.conditionalExpression(inTest, n, emptyExpression);
              n = t.logicalExpression("||", n, addEmpty);
            }
            return n;
          },
          {
            skipInvariant: true,
          }
        );
        tvalFor.set(key, tval);
      }
    });
    pbindings.forEach((val, key, map) => {
      if (key.object instanceof ObjectValue && newlyCreatedObjects.has(key.object)) {
        return;
      }
      let path = key.pathNode;
      let tval = tvalFor.get(key);
      invariant(val !== undefined);
      let value = val.value;
      invariant(value instanceof Value);
      let mightHaveBeenDeleted = value.mightHaveBeenDeleted();
      let mightBeUndefined = value.mightBeUndefined();
      if (typeof key.key === "string") {
        gen.emitStatement([key.object, tval || value, this.intrinsics.empty], ([o, v, e]) => {
          invariant(path !== undefined);
          let lh = path.buildNode([o, t.identifier(key.key)]);
          let r = t.expressionStatement(t.assignmentExpression("=", (lh: any), v));
          if (mightHaveBeenDeleted) {
            // If v === __empty || (v === undefined  && !(key.key in o))  then delete it
            let emptyTest = t.binaryExpression("===", v, e);
            let undefinedTest = t.binaryExpression("===", v, voidExpression);
            let inTest = t.unaryExpression("!", t.binaryExpression("in", t.stringLiteral(key.key), o));
            let guard = t.logicalExpression("||", emptyTest, t.logicalExpression("&&", undefinedTest, inTest));
            let deleteIt = t.expressionStatement(t.unaryExpression("delete", (lh: any)));
            return t.ifStatement(mightBeUndefined ? emptyTest : guard, deleteIt, r);
          }
          return r;
        });
      } else {
        gen.emitStatement([key.object, key.key, tval || value, this.intrinsics.empty], ([o, p, v, e]) => {
          invariant(path !== undefined);
          let lh = path.buildNode([o, p]);
          return t.expressionStatement(t.assignmentExpression("=", (lh: any), v));
        });
      }
    });
  }

  composeEffects(priorEffects: Effects, subsequentEffects: Effects): Effects {
    let [, pg, pb, pp, po] = priorEffects;
    let [sc, sg, sb, sp, so] = subsequentEffects;
    let result = construct_empty_effects(this);
    let [, , rb, rp, ro] = result;

    result[0] = sc;

    result[1] = Join.composeGenerators(this, pg || result[1], sg);

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
      this.savedCompletion.savedPathConditions = this.pathConditions;
      this.pathConditions = [].concat(this.pathConditions);
      this.captureEffects(completion);
    } else {
      invariant(this.savedCompletion.savedEffects !== undefined);
      invariant(this.generator !== undefined);
      this.savedCompletion.savedEffects[1].appendGenerator(this.generator, "composeWithSavedCompletion");
      this.generator = new Generator(this, "composeWithSavedCompletion");
      invariant(this.savedCompletion !== undefined);
      this.savedCompletion = Join.composePossiblyNormalCompletions(this, this.savedCompletion, completion);
    }
    pushPathConditionsLeadingToNormalCompletion(completion);
    return completion.value;

    function pushPathConditionsLeadingToNormalCompletion(c: PossiblyNormalCompletion) {
      if (c.consequent instanceof AbruptCompletion) {
        Path.pushInverseAndRefine(c.joinCondition);
        if (c.alternate instanceof PossiblyNormalCompletion) pushPathConditionsLeadingToNormalCompletion(c.alternate);
      } else if (c.alternate instanceof AbruptCompletion) {
        Path.pushAndRefine(c.joinCondition);
        if (c.consequent instanceof PossiblyNormalCompletion) pushPathConditionsLeadingToNormalCompletion(c.consequent);
      }
    }
  }

  incorporatePriorSavedCompletion(priorCompletion: void | PossiblyNormalCompletion) {
    if (priorCompletion === undefined) return;
    if (this.savedCompletion === undefined) {
      this.savedCompletion = priorCompletion;
      this.captureEffects(priorCompletion);
    } else {
      invariant(priorCompletion.savedEffects !== undefined);
      let savedEffects = this.savedCompletion.savedEffects;
      invariant(savedEffects !== undefined);
      this.restoreBindings(savedEffects[2]);
      this.restoreProperties(savedEffects[3]);
      Join.updatePossiblyNormalCompletionWithSubsequentEffects(this, priorCompletion, savedEffects);
      this.restoreBindings(savedEffects[2]);
      this.restoreProperties(savedEffects[3]);
      invariant(this.savedCompletion !== undefined);
      this.savedCompletion.savedEffects = undefined;
      this.savedCompletion = Join.composePossiblyNormalCompletions(this, priorCompletion, this.savedCompletion);
    }
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
    this.generator = new Generator(this, "captured");
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
  applyEffects(effects: Effects, leadingComment: string = "", appendGenerator: boolean = true) {
    let [, generator, bindings, properties, createdObjects] = effects;

    // Add generated code for property modifications
    if (appendGenerator) this.appendGenerator(generator, leadingComment);

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
        let nextString = To.ToString(realm, next);
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
      this.modifiedBindings.set(binding, {
        hasLeaked: binding.hasLeaked,
        value: binding.value,
      });
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
    if (this.createdObjectsTrackedForLeaks !== undefined) {
      this.createdObjectsTrackedForLeaks.add(object);
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
    modifiedBindings.forEach(({ hasLeaked, value }, binding, m) => {
      let l = binding.hasLeaked;
      let v = binding.value;
      binding.hasLeaked = hasLeaked;
      binding.value = value;
      m.set(binding, {
        hasLeaked: l,
        value: v,
      });
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
    if (propertyValue.kind === "abstractConcreteUnion") {
      let absVal = propertyValue.args.find(e => e instanceof AbstractValue);
      invariant(absVal instanceof AbstractValue);
      propertyValue = absVal;
    }
    if (!propertyValue.isIntrinsic()) {
      propertyValue.intrinsicName = `${path}.${key}`;
      propertyValue.kind = "rebuiltProperty";
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
  // Return value indicates whether the caller should try to recover from the error or not.
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

  saveNameString(nameString: string): void {
    this._abstractValuesDefined.add(nameString);
  }

  isNameStringUnique(nameString: string): boolean {
    return !this._abstractValuesDefined.has(nameString);
  }
}
