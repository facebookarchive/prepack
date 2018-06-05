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
  ClassComponentMetadata,
  ConsoleMethodTypes,
  DebugServerType,
  Descriptor,
  Intrinsics,
  PropertyBinding,
  ReactHint,
} from "./types.js";
import { RealmStatistics } from "./statistics.js";
import {
  CompilerDiagnostic,
  type ErrorHandlerResult,
  type ErrorHandler,
  FatalError,
  InfeasiblePathError,
} from "./errors.js";
import {
  AbstractObjectValue,
  AbstractValue,
  ArrayValue,
  BoundFunctionValue,
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
  ForkedAbruptCompletion,
  PossiblyNormalCompletion,
  ThrowCompletion,
} from "./completions.js";
import type { Compatibility, RealmOptions, ReactOutputTypes, InvariantModeTypes } from "./options.js";
import invariant from "./invariant.js";
import seedrandom from "seedrandom";
import { Generator, PreludeGenerator } from "./utils/generator.js";
import { emptyExpression, voidExpression } from "./utils/internalizer.js";
import { Environment, Functions, Join, Properties, To, Widen, Path } from "./singletons.js";
import type { ReactSymbolTypes } from "./react/utils.js";
import type { BabelNode, BabelNodeSourceLocation, BabelNodeLVal, BabelNodeStatement } from "babel-types";
import * as t from "babel-types";

export type BindingEntry = { leakedImmutableValue: void | Value, hasLeaked: boolean, value: void | Value };
export type Bindings = Map<Binding, BindingEntry>;
export type EvaluationResult = Completion | Reference | Value;
export type PropertyBindings = Map<PropertyBinding, void | Descriptor>;

export type CreatedObjects = Set<ObjectValue>;

export type SideEffectType = "MODIFIED_BINDING" | "MODIFIED_PROPERTY" | "EXCEPTION_THROWN" | "MODIFIED_GLOBAL";

let effects_uid = 0;

export class Effects {
  constructor(
    result: EvaluationResult,
    generator: Generator,
    bindings: Bindings,
    propertyBindings: PropertyBindings,
    createdObjects: CreatedObjects
  ) {
    this.result = result;
    this.generator = generator;
    this.modifiedBindings = bindings;
    this.modifiedProperties = propertyBindings;
    this.createdObjects = createdObjects;

    this.canBeApplied = true;
    this._id = effects_uid++;
  }

  result: EvaluationResult;
  generator: Generator;
  modifiedBindings: Bindings;
  modifiedProperties: PropertyBindings;
  createdObjects: CreatedObjects;
  canBeApplied: boolean;
  _id: number;
}

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
  return new Effects(
    realm.intrinsics.empty,
    new Generator(realm, "construct_empty_effects"),
    new Map(),
    new Map(),
    new Set()
  );
}

export class Realm {
  constructor(opts: RealmOptions, statistics: RealmStatistics) {
    this.statistics = statistics;
    this.isReadOnly = false;
    this.useAbstractInterpretation = opts.serialize === true || opts.residual === true || Array.isArray(opts.check);
    this.ignoreLeakLogic = false;
    this.isInPureTryStatement = false;
    if (opts.mathRandomSeed !== undefined) {
      this.mathRandomGenerator = seedrandom(opts.mathRandomSeed);
    }
    this.strictlyMonotonicDateNow = !!opts.strictlyMonotonicDateNow;

    // 0 = disabled
    this.abstractValueImpliesMax = opts.abstractValueImpliesMax !== undefined ? opts.abstractValueImpliesMax : 0;
    this.abstractValueImpliesCounter = 0;
    this.inSimplificationPath = false;

    this.timeout = opts.timeout;
    if (this.timeout !== undefined) {
      // We'll call Date.now for every this.timeoutCounterThreshold'th AST node.
      // The threshold is there to reduce the cost of the surprisingly expensive Date.now call.
      this.timeoutCounter = this.timeoutCounterThreshold = 1024;
    }

    this.start = Date.now();
    this.compatibility = opts.compatibility !== undefined ? opts.compatibility : "browser";
    this.maxStackDepth = opts.maxStackDepth || 225;
    this.invariantLevel = opts.invariantLevel || 0;
    this.invariantMode = opts.invariantMode || "throw";
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
      optimizedNestedClosuresToWrite: [],
      arrayHints: new WeakMap(),
      classComponentMetadata: new Map(),
      currentOwner: undefined,
      defaultPropsHelper: undefined,
      enabled: opts.reactEnabled || false,
      hoistableFunctions: new WeakMap(),
      hoistableReactElements: new WeakMap(),
      noopFunction: undefined,
      optimizeNestedFunctions: opts.reactOptimizeNestedFunctions || false,
      output: opts.reactOutput || "create-element",
      propsWithNoPartialKeyOrRef: new WeakSet(),
      reactElements: new WeakSet(),
      symbols: new Map(),
      usedReactElementKeys: new Set(),
      verbose: opts.reactVerbose || false,
    };

    this.alreadyDescribedLocations = new WeakMap();
    this.stripFlow = opts.stripFlow || false;

    this.fbLibraries = {
      other: new Map(),
      react: undefined,
      reactDom: undefined,
      reactDomServer: undefined,
      reactRelay: undefined,
    };

    this.errorHandler = opts.errorHandler;

    this.globalSymbolRegistry = [];
    this.activeLexicalEnvironments = new Set();
    this._abstractValuesDefined = new Set(); // A set of nameStrings to ensure abstract values have unique names
    this.debugNames = opts.debugNames;
    this._checkedObjectIds = new Map();
  }

  statistics: RealmStatistics;
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
  invariantLevel: number;
  invariantMode: InvariantModeTypes;
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
  reportSideEffectCallback:
    | void
    | ((sideEffectType: SideEffectType, binding: void | Binding | PropertyBinding, expressionLocation: any) => void);
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
    optimizedNestedClosuresToWrite: Array<{
      effects: Effects,
      func: ECMAScriptSourceFunctionValue | BoundFunctionValue,
    }>,
    arrayHints: WeakMap<ArrayValue, { func: Value, thisVal: Value }>,
    classComponentMetadata: Map<ECMAScriptSourceFunctionValue, ClassComponentMetadata>,
    currentOwner?: ObjectValue,
    defaultPropsHelper?: ECMAScriptSourceFunctionValue,
    enabled: boolean,
    hoistableFunctions: WeakMap<FunctionValue, boolean>,
    hoistableReactElements: WeakMap<ObjectValue, boolean>,
    noopFunction: void | ECMAScriptSourceFunctionValue,
    optimizeNestedFunctions: boolean,
    output?: ReactOutputTypes,
    propsWithNoPartialKeyOrRef: WeakSet<ObjectValue | AbstractObjectValue>,
    reactElements: WeakSet<ObjectValue>,
    symbols: Map<ReactSymbolTypes, SymbolValue>,
    usedReactElementKeys: Set<string>,
    verbose: boolean,
  };
  alreadyDescribedLocations: WeakMap<FunctionValue | BabelNodeSourceLocation, string | void>;
  stripFlow: boolean;

  fbLibraries: {
    other: Map<string, AbstractValue>,
    react: void | ObjectValue,
    reactDom: void | ObjectValue,
    reactDomServer: void | ObjectValue,
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
  suppressDiagnostics = false;
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
  _checkedObjectIds: Map<ObjectValue | AbstractObjectValue, number>;

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
    if (timeout !== undefined && !--this.timeoutCounter) {
      this.timeoutCounter = this.timeoutCounterThreshold;
      let total = Date.now() - this.start;
      if (total > timeout) {
        let error = new CompilerDiagnostic(
          `total time has exceeded the timeout time: ${timeout}`,
          this.currentLocation,
          "PP0036",
          "FatalError"
        );
        this.handleError(error);
        throw new FatalError();
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
      this.clearBlockBindings(completion.alternateEffects.modifiedBindings, environmentRecord);
      this.clearBlockBindings(completion.consequentEffects.modifiedBindings, environmentRecord);
      if (completion.savedEffects !== undefined)
        this.clearBlockBindings(completion.savedEffects.modifiedBindings, environmentRecord);
      if (completion.alternate instanceof Completion)
        this.clearBlockBindingsFromCompletion(completion.alternate, environmentRecord);
      if (completion.consequent instanceof Completion)
        this.clearBlockBindingsFromCompletion(completion.consequent, environmentRecord);
    } else if (completion instanceof ForkedAbruptCompletion) {
      this.clearBlockBindings(completion.alternateEffects.modifiedBindings, environmentRecord);
      this.clearBlockBindings(completion.consequentEffects.modifiedBindings, environmentRecord);
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
      this.clearFunctionBindings(completion.alternateEffects.modifiedBindings, funcVal);
      this.clearFunctionBindings(completion.consequentEffects.modifiedBindings, funcVal);
      if (completion.savedEffects !== undefined)
        this.clearFunctionBindings(completion.savedEffects.modifiedBindings, funcVal);
      if (completion.alternate instanceof Completion)
        this.clearFunctionBindingsFromCompletion(completion.alternate, funcVal);
      if (completion.consequent instanceof Completion)
        this.clearFunctionBindingsFromCompletion(completion.consequent, funcVal);
    } else if (completion instanceof ForkedAbruptCompletion) {
      this.clearFunctionBindings(completion.alternateEffects.modifiedBindings, funcVal);
      this.clearFunctionBindings(completion.consequentEffects.modifiedBindings, funcVal);
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

  neverCheckProperty(object: ObjectValue | AbstractObjectValue, P: string) {
    return (
      P.startsWith("__") ||
      (object === this.$GlobalObject && P === "global") ||
      (object.intrinsicName !== undefined && object.intrinsicName.startsWith("__"))
    );
  }

  _getCheckedBindings(): ObjectValue {
    let globalObject = this.$GlobalObject;
    invariant(globalObject instanceof ObjectValue);
    let binding = globalObject.properties.get("__checkedBindings");
    invariant(binding !== undefined);
    let checkedBindingsObject = binding.descriptor && binding.descriptor.value;
    invariant(checkedBindingsObject instanceof ObjectValue);
    return checkedBindingsObject;
  }

  markPropertyAsChecked(object: ObjectValue | AbstractObjectValue, P: string) {
    invariant(!this.neverCheckProperty(object, P));
    let objectId = this._checkedObjectIds.get(object);
    if (objectId === undefined) this._checkedObjectIds.set(object, (objectId = this._checkedObjectIds.size));
    let id = `__${objectId}:${P}`;
    let checkedBindings = this._getCheckedBindings();
    checkedBindings.$Set(id, this.intrinsics.true, checkedBindings);
  }

  hasBindingBeenChecked(object: ObjectValue | AbstractObjectValue, P: string): void | boolean {
    if (this.neverCheckProperty(object, P)) return true;
    let objectId = this._checkedObjectIds.get(object);
    if (objectId === undefined) return false;
    let id = `__${objectId}:${P}`;
    let binding = this._getCheckedBindings().properties.get(id);
    if (binding === undefined) return false;
    let value = binding.descriptor && binding.descriptor.value;
    return value instanceof Value && !value.mightNotBeTrue();
  }

  // Evaluate a context as if it won't have any side-effects outside of any objects
  // that it created itself. This promises that any abstract functions inside of it
  // also won't have effects on any objects or bindings that weren't created in this
  // call.
  evaluatePure<T>(
    f: () => T,
    reportSideEffectFunc?: (
      sideEffectType: SideEffectType,
      binding: void | Binding | PropertyBinding,
      value: void | Value
    ) => void
  ) {
    let saved_createdObjectsTrackedForLeaks = this.createdObjectsTrackedForLeaks;
    let saved_reportSideEffectCallback = this.reportSideEffectCallback;
    // Track all objects (including function closures) created during
    // this call. This will be used to make the assumption that every
    // *other* object is unchanged (pure). These objects are marked
    // as leaked if they're passed to abstract functions.
    this.createdObjectsTrackedForLeaks = new Set();
    this.reportSideEffectCallback = reportSideEffectFunc;
    try {
      return f();
    } finally {
      this.createdObjectsTrackedForLeaks = saved_createdObjectsTrackedForLeaks;
      this.reportSideEffectCallback = saved_reportSideEffectCallback;
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
    generatorName?: string = "evaluateNodeForEffects"
  ): Effects {
    return this.evaluateForEffects(() => env.evaluateCompletionDeref(ast, strictCode), state, generatorName);
  }

  evaluateForEffectsInGlobalEnv(
    func: () => Value,
    state?: any,
    generatorName?: string = "evaluateForEffectsInGlobalEnv"
  ): Effects {
    return this.wrapInGlobalEnv(() => this.evaluateForEffects(func, state, generatorName));
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
        this.restoreBindings(effects.modifiedBindings);
        this.restoreProperties(effects.modifiedProperties);
        invariant(!effects.canBeApplied);
        effects.canBeApplied = true;
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
        result = new Effects(c, astGenerator, astBindings, astProperties, astCreatedObjects);
        return result;
      } finally {
        // Roll back the state changes
        if (this.savedCompletion !== undefined) this.stopEffectCaptureAndUndoEffects(this.savedCompletion);
        if (result !== undefined) {
          this.restoreBindings(result.modifiedBindings);
          this.restoreProperties(result.modifiedProperties);
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
      return effects.result instanceof Value ? effects.result : defaultValue;
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
      let resultVal = effects.result;
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

  evaluateForFixpointEffects(iteration: () => [Value, EvaluationResult]): void | [Effects, Effects, AbstractValue] {
    try {
      let test;
      let f = () => {
        let result;
        [test, result] = iteration();
        if (!(test instanceof AbstractValue)) throw new FatalError("loop terminates before fixed point");
        invariant(result instanceof Completion || result instanceof Value);
        return result;
      };
      let effects1 = this.evaluateForEffects(f, undefined, "evaluateForFixpointEffects/1");
      while (true) {
        this.restoreBindings(effects1.modifiedBindings);
        this.restoreProperties(effects1.modifiedProperties);
        let effects2 = this.evaluateForEffects(f, undefined, "evaluateForFixpointEffects/2");
        this.restoreBindings(effects1.modifiedBindings);
        this.restoreProperties(effects1.modifiedProperties);
        if (Widen.containsEffects(effects1, effects2)) {
          // effects1 includes every value present in effects2, so doing another iteration using effects2 will not
          // result in any more values being added to abstract domains and hence a fixpoint has been reached.
          // Generate code using effects2 because its expressions have not been widened away.
          const e2 = effects2;
          this._applyPropertiesToNewlyCreatedObjects(e2.modifiedProperties, e2.createdObjects);
          this._emitPropertAssignments(e2.generator, e2.modifiedProperties, e2.createdObjects);
          this._emitLocalAssignments(e2.generator, e2.modifiedBindings, e2.createdObjects);
          invariant(test instanceof AbstractValue);
          let cond = e2.generator.deriveAbstract(test.types, test.values, [test], ([n]) => n, {
            skipInvariant: true,
          });
          return [effects1, effects2, cond];
        }
        effects1 = Widen.widenEffects(this, effects1, effects2);
      }
    } catch (e) {
      return undefined;
    }
  }

  evaluateWithAbstractConditional(
    condValue: AbstractValue,
    consequentEffectsFunc: () => Effects,
    alternateEffectsFunc: () => Effects
  ): Value {
    // Evaluate consequent and alternate in sandboxes and get their effects.
    let effects1;
    try {
      effects1 = Path.withCondition(condValue, consequentEffectsFunc);
    } catch (e) {
      if (!(e instanceof InfeasiblePathError)) throw e;
    }

    let effects2;
    try {
      effects2 = Path.withInverseCondition(condValue, alternateEffectsFunc);
    } catch (e) {
      if (!(e instanceof InfeasiblePathError)) throw e;
    }

    let joinedEffects, completion;
    if (effects1 === undefined || effects2 === undefined) {
      if (effects1 === undefined && effects2 === undefined) throw new InfeasiblePathError();
      joinedEffects = effects1 || effects2;
      invariant(joinedEffects !== undefined);
      completion = joinedEffects.result;
      this.applyEffects(joinedEffects, "evaluateWithAbstractConditional");
    } else {
      // Join the effects, creating an abstract view of what happened, regardless
      // of the actual value of condValue.
      joinedEffects = Join.joinForkOrChoose(this, condValue, effects1, effects2);
      completion = joinedEffects.result;
      if (completion instanceof ForkedAbruptCompletion) {
        // Note that the effects are tracked separately inside completion and will be applied later.
        throw completion;
      }
      if (completion instanceof PossiblyNormalCompletion) {
        // in this case one of the branches may complete abruptly, which means that
        // not all control flow branches join into one flow at this point.
        // Consequently we have to continue tracking changes until the point where
        // all the branches come together into one.
        completion = this.composeWithSavedCompletion(completion);
        this.applyEffects(joinedEffects, "evaluateWithAbstractConditional", false);
      } else {
        this.applyEffects(joinedEffects, "evaluateWithAbstractConditional");
      }
    }

    // return or throw completion
    if (completion instanceof AbruptCompletion) throw completion;
    invariant(completion instanceof Value);
    return completion;
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
        let tval = gen.deriveAbstract(val.types, val.values, [val], ([n]) => n, {
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
      if (
        key.object instanceof ObjectValue &&
        (newlyCreatedObjects.has(key.object) || key.object.refuseSerialization)
      ) {
        return;
      }
      let value = val && val.value;
      if (value instanceof AbstractValue) {
        invariant(value._buildNode !== undefined);
        let tval = gen.deriveAbstract(
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
      if (
        key.object instanceof ObjectValue &&
        (newlyCreatedObjects.has(key.object) || key.object.refuseSerialization)
      ) {
        return;
      }
      let path = key.pathNode;
      let tval = tvalFor.get(key);
      invariant(val !== undefined);
      let value = val.value;
      invariant(value instanceof Value);
      let mightHaveBeenDeleted = value.mightHaveBeenDeleted();
      let mightBeUndefined = value.mightBeUndefined();
      let keyKey = key.key;
      if (typeof keyKey === "string") {
        gen.emitStatement([key.object, tval || value, this.intrinsics.empty], ([o, v, e]) => {
          invariant(path !== undefined);
          invariant(typeof keyKey === "string");
          let lh = path.buildNode([o, t.identifier(keyKey)]);
          let r = t.expressionStatement(t.assignmentExpression("=", (lh: any), v));
          if (mightHaveBeenDeleted) {
            // If v === __empty || (v === undefined  && !(key.key in o))  then delete it
            let emptyTest = t.binaryExpression("===", v, e);
            let undefinedTest = t.binaryExpression("===", v, voidExpression);
            let inTest = t.unaryExpression("!", t.binaryExpression("in", t.stringLiteral(keyKey), o));
            let guard = t.logicalExpression("||", emptyTest, t.logicalExpression("&&", undefinedTest, inTest));
            let deleteIt = t.expressionStatement(t.unaryExpression("delete", (lh: any)));
            return t.ifStatement(mightBeUndefined ? emptyTest : guard, deleteIt, r);
          }
          return r;
        });
      } else {
        // TODO: What if keyKey is undefined?
        invariant(keyKey instanceof Value);
        gen.emitStatement([key.object, keyKey, tval || value, this.intrinsics.empty], ([o, p, v, e]) => {
          invariant(path !== undefined);
          let lh = path.buildNode([o, p]);
          return t.expressionStatement(t.assignmentExpression("=", (lh: any), v));
        });
      }
    });
  }

  composeEffects(priorEffects: Effects, subsequentEffects: Effects): Effects {
    let result = construct_empty_effects(this);

    result.result = subsequentEffects.result;

    result.generator = Join.composeGenerators(
      this,
      priorEffects.generator || result.generator,
      subsequentEffects.generator
    );

    if (priorEffects.modifiedBindings) {
      priorEffects.modifiedBindings.forEach((val, key, m) => result.modifiedBindings.set(key, val));
    }
    subsequentEffects.modifiedBindings.forEach((val, key, m) => result.modifiedBindings.set(key, val));

    if (priorEffects.modifiedProperties) {
      priorEffects.modifiedProperties.forEach((desc, propertyBinding, m) =>
        result.modifiedProperties.set(propertyBinding, desc)
      );
    }
    subsequentEffects.modifiedProperties.forEach((val, key, m) => result.modifiedProperties.set(key, val));

    if (priorEffects.createdObjects) {
      priorEffects.createdObjects.forEach((ob, a) => result.createdObjects.add(ob));
    }
    subsequentEffects.createdObjects.forEach((ob, a) => result.createdObjects.add(ob));

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

  wrapSavedCompletion(completion: PossiblyNormalCompletion) {
    if (this.savedCompletion !== undefined) {
      if (completion.consequent instanceof AbruptCompletion) {
        completion.alternate = this.savedCompletion;
      } else {
        completion.consequent = this.savedCompletion;
      }
      completion.savedEffects = this.savedCompletion.savedEffects;
    } else {
      this.captureEffects(completion);
    }
    this.savedCompletion = completion;
  }

  composeWithSavedCompletion(completion: PossiblyNormalCompletion): Value {
    if (this.savedCompletion === undefined) {
      this.savedCompletion = completion;
      this.savedCompletion.savedPathConditions = this.pathConditions;
      this.pathConditions = [].concat(this.pathConditions);
      this.captureEffects(completion);
    } else {
      let savedCompletion = this.savedCompletion;
      let e = this.getCapturedEffects(savedCompletion);
      invariant(e !== undefined);
      this.stopEffectCaptureAndUndoEffects(savedCompletion);
      savedCompletion = Join.composePossiblyNormalCompletions(this, savedCompletion, completion, e);
      this.applyEffects(e);
      this.captureEffects(savedCompletion);
      this.savedCompletion = savedCompletion;
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
    // A completion that has been saved and that is still active, will always have savedEffects.
    invariant(priorCompletion.savedEffects !== undefined);
    if (this.savedCompletion === undefined) {
      // priorCompletion must be a previous savedCompletion, so the corresponding tracking maps would have been
      // captured in priorCompletion.savedEffects and restored to the realm when clearing out this.savedCompletion.
      // Since there is curently no savedCompletion, all the forks subsequent to the last normal fork in
      // priorCompletion will have joined up again and their effects will have been applied to the current
      // tracking maps.
      invariant(this.modifiedBindings !== undefined);
      this.savedCompletion = priorCompletion;
    } else {
      let savedEffects = this.savedCompletion.savedEffects;
      invariant(savedEffects !== undefined);
      this.restoreBindings(savedEffects.modifiedBindings);
      this.restoreProperties(savedEffects.modifiedProperties);
      Join.updatePossiblyNormalCompletionWithSubsequentEffects(this, priorCompletion, savedEffects);
      this.restoreBindings(savedEffects.modifiedBindings);
      this.restoreProperties(savedEffects.modifiedProperties);
      invariant(this.savedCompletion !== undefined);
      this.savedCompletion.savedEffects = undefined;
      this.savedCompletion = Join.composePossiblyNormalCompletions(this, priorCompletion, this.savedCompletion);
    }
  }

  captureEffects(completion: PossiblyNormalCompletion) {
    invariant(completion.savedEffects === undefined);
    completion.savedEffects = new Effects(
      this.intrinsics.undefined,
      (this.generator: any),
      (this.modifiedBindings: any),
      (this.modifiedProperties: any),
      (this.createdObjects: any)
    );
    this.generator = new Generator(this, "captured");
    this.modifiedBindings = new Map();
    this.modifiedProperties = new Map();
    this.createdObjects = new Set();
  }

  getCapturedEffects(completion: PossiblyNormalCompletion, v?: Value = this.intrinsics.undefined): void | Effects {
    if (completion.savedEffects === undefined) return undefined;
    invariant(this.generator !== undefined);
    invariant(this.modifiedBindings !== undefined);
    invariant(this.modifiedProperties !== undefined);
    invariant(this.createdObjects !== undefined);
    return new Effects(v, this.generator, this.modifiedBindings, this.modifiedProperties, this.createdObjects);
  }

  stopEffectCaptureAndUndoEffects(completion: PossiblyNormalCompletion) {
    // Roll back the state changes
    this.restoreBindings(this.modifiedBindings);
    this.restoreProperties(this.modifiedProperties);

    // Restore saved state
    if (completion.savedEffects !== undefined) {
      const savedEffects = completion.savedEffects;
      completion.savedEffects = undefined;
      this.generator = savedEffects.generator;
      this.modifiedBindings = savedEffects.modifiedBindings;
      this.modifiedProperties = savedEffects.modifiedProperties;
      this.createdObjects = savedEffects.createdObjects;
    } else {
      invariant(false);
    }
  }

  // Apply the given effects to the global state
  applyEffects(effects: Effects, leadingComment: string = "", appendGenerator: boolean = true) {
    invariant(
      effects.canBeApplied,
      "Effects have been applied and not properly reverted. It is not safe to apply them a second time."
    );
    effects.canBeApplied = false;
    let { generator, modifiedBindings, modifiedProperties, createdObjects } = effects;

    // Add generated code for property modifications
    if (appendGenerator) this.appendGenerator(generator, leadingComment);

    // Restore modifiedBindings
    this.restoreBindings(modifiedBindings);
    this.restoreProperties(modifiedProperties);

    // track modifiedBindings
    let realmModifiedBindings = this.modifiedBindings;
    if (realmModifiedBindings !== undefined) {
      modifiedBindings.forEach((val, key, m) => {
        invariant(realmModifiedBindings !== undefined);
        if (!realmModifiedBindings.has(key)) {
          realmModifiedBindings.set(key, val);
        }
      });
    }
    let realmModifiedProperties = this.modifiedProperties;
    if (realmModifiedProperties !== undefined) {
      modifiedProperties.forEach((desc, propertyBinding, m) => {
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

  outputToConsole(method: ConsoleMethodTypes, args: Array<string | ConcreteValue>): void {
    if (this.isReadOnly) {
      // This only happens during speculative execution and is reported elsewhere
      throw new FatalError("Trying to create console output in read-only realm");
    }
    if (this.useAbstractInterpretation) {
      invariant(this.generator !== undefined);
      this.generator.emitConsoleLog(method, args);
    } else {
      // $FlowFixMe: Flow doesn't have type data for all the console methods yet
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
  recordModifiedBinding(binding: Binding, value?: Value): Binding {
    const isDefinedInsidePureFn = root => {
      let context = this.getRunningContext();
      let { lexicalEnvironment: env, function: func } = context;

      invariant(func instanceof FunctionValue);
      if (root instanceof FunctionEnvironmentRecord && func === root.$FunctionObject) {
        return true;
      }
      if (this.createdObjectsTrackedForLeaks !== undefined && !this.createdObjectsTrackedForLeaks.has(func)) {
        return false;
      }
      env = env.parent;
      while (env) {
        if (env.environmentRecord === root) {
          return true;
        }
        env = env.parent;
      }
      return false;
    };

    if (
      this.modifiedBindings !== undefined &&
      !this.modifiedBindings.has(binding) &&
      value !== undefined &&
      this.isInPureScope() &&
      this.reportSideEffectCallback !== undefined
    ) {
      let env = binding.environment;

      if (
        !(env instanceof DeclarativeEnvironmentRecord) ||
        (env instanceof DeclarativeEnvironmentRecord && !isDefinedInsidePureFn(env))
      ) {
        this.reportSideEffectCallback("MODIFIED_BINDING", binding, value.expressionLocation);
      }
    }

    if (binding.environment.isReadOnly) {
      // This only happens during speculative execution and is reported elsewhere
      throw new FatalError("Trying to modify a binding in read-only realm");
    }

    if (this.modifiedBindings !== undefined && !this.modifiedBindings.has(binding)) {
      this.modifiedBindings.set(binding, {
        leakedImmutableValue: binding.leakedImmutableValue,
        hasLeaked: binding.hasLeaked,
        value: binding.value,
      });
    }
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
    if (this.isInPureScope()) {
      let object = binding.object;
      invariant(object instanceof ObjectValue);
      const createdObjectsTrackedForLeaks = this.createdObjectsTrackedForLeaks;

      if (createdObjectsTrackedForLeaks !== undefined && !createdObjectsTrackedForLeaks.has(object)) {
        if (binding.object === this.$GlobalObject) {
          this.reportSideEffectCallback &&
            this.reportSideEffectCallback("MODIFIED_GLOBAL", binding, object.expressionLocation);
        } else {
          this.reportSideEffectCallback &&
            this.reportSideEffectCallback("MODIFIED_PROPERTY", binding, object.expressionLocation);
        }
      }
    }
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
    modifiedBindings.forEach(({ leakedImmutableValue, hasLeaked, value }, binding, m) => {
      let liv = binding.leakedImmutableValue;
      let l = binding.hasLeaked;
      let v = binding.value;
      binding.leakedImmutableValue = liv;
      binding.hasLeaked = hasLeaked;
      binding.value = value;
      m.set(binding, {
        leakedImmutableValue: liv,
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

  // This function gets the evaluated effects with a collection of
  // prior nested affects applied (and their canBeApplied flag reset)
  // We can safely do this as we've wrapped the effects in evaluated
  // effects, meaning all the effects applied to Realm get restored
  evaluateForEffectsWithPriorEffects(
    priorEffects: Array<Effects>,
    f: () => AbruptCompletion | Value,
    generatorName: string
  ): Effects {
    return this.evaluateForEffects(
      () => {
        for (let priorEffect of priorEffects) this.applyEffects(priorEffect);
        try {
          return f();
        } finally {
          for (let priorEffect of priorEffects) {
            invariant(!priorEffect.canBeApplied);
            priorEffect.canBeApplied = true;
          }
        }
      },
      undefined,
      generatorName
    );
  }

  // Pass the error to the realm's error-handler
  // Return value indicates whether the caller should try to recover from the error or not.
  handleError(diagnostic: CompilerDiagnostic): ErrorHandlerResult {
    if (!diagnostic.callStack && this.contextStack.length > 0) {
      let error = Construct(this, this.intrinsics.Error);
      let stack = error._SafeGetDataPropertyValue("stack");
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
