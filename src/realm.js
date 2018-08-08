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
  DisplayResult,
  ArgModel,
  DebugReproManagerType,
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
  SimpleNormalCompletion,
  ThrowCompletion,
} from "./completions.js";
import type { Compatibility, RealmOptions, ReactOutputTypes, InvariantModeTypes } from "./options.js";
import invariant from "./invariant.js";
import seedrandom from "seedrandom";
import { createOperationDescriptor, Generator, type TemporalOperationEntry } from "./utils/generator.js";
import { PreludeGenerator } from "./utils/PreludeGenerator.js";
import { Environment, Functions, Join, Properties, To, Widen, Path } from "./singletons.js";
import type { ReactSymbolTypes } from "./react/utils.js";
import type { BabelNode, BabelNodeSourceLocation, BabelNodeLVal, BabelNodeStatement } from "@babel/types";
import { Utils } from "./singletons.js";
export type BindingEntry = {
  hasLeaked: void | boolean,
  value: void | Value,
  previousHasLeaked: void | boolean,
  previousValue: void | Value,
};
export type Bindings = Map<Binding, BindingEntry>;
export type EvaluationResult = Completion | Reference;
export type PropertyBindings = Map<PropertyBinding, void | Descriptor>;

export type CreatedObjects = Set<ObjectValue>;

export type SideEffectType = "MODIFIED_BINDING" | "MODIFIED_PROPERTY" | "EXCEPTION_THROWN" | "MODIFIED_GLOBAL";

let effects_uid = 0;

export class Effects {
  constructor(
    result: Completion,
    generator: Generator,
    bindings: Bindings,
    propertyBindings: PropertyBindings,
    createdObjects: CreatedObjects
  ) {
    this._result = result;
    this.generator = generator;
    this.modifiedBindings = bindings;
    this.modifiedProperties = propertyBindings;
    this.createdObjects = createdObjects;

    this.canBeApplied = true;
    this._id = effects_uid++;
    invariant(result.effects === undefined);
    result.effects = this;
  }

  _result: Completion;
  get result(): Completion {
    return this._result;
  }
  set result(completion: Completion): void {
    invariant(completion.effects === undefined);
    if (completion.effects === undefined) completion.effects = this; //todo: require callers to ensure this
    this._result = completion;
  }

  generator: Generator;
  modifiedBindings: Bindings;
  modifiedProperties: PropertyBindings;
  createdObjects: CreatedObjects;
  canBeApplied: boolean;
  _id: number;

  shallowCloneWithResult(result: Completion): Effects {
    return new Effects(result, this.generator, this.modifiedBindings, this.modifiedProperties, this.createdObjects);
  }

  toDisplayString(): string {
    return Utils.jsonToDisplayString(this, 10);
  }

  toDisplayJson(depth: number = 1): DisplayResult {
    if (depth <= 0) return `Effects ${this._id}`;
    return Utils.verboseToDisplayJson(this, depth);
  }
}

export class Tracer {
  beginEvaluateForEffects(state: any): void {}
  endEvaluateForEffects(state: any, effects: void | Effects): void {}
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
  ): void {}
  afterCall(
    F: FunctionValue,
    thisArgument: void | Value,
    argumentsList: Array<Value>,
    newTarget: void | ObjectValue,
    result: void | Reference | Value | AbruptCompletion
  ): void {}
  beginOptimizingFunction(optimizedFunctionId: number, functionValue: FunctionValue): void {}
  endOptimizingFunction(optimizedFunctionId: number): void {}
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

  setFunction(F: null | FunctionValue): void {
    if (F instanceof ECMAScriptSourceFunctionValue) this.isStrict = F.$Strict;
    this.function = F;
  }

  setLocation(loc: null | BabelNodeSourceLocation): void {
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

export function construct_empty_effects(
  realm: Realm,
  c: Completion = new SimpleNormalCompletion(realm.intrinsics.empty, undefined)
): Effects {
  // TODO #2222: Check if `realm.pathConditions` is always correct here.
  // The path conditions here should probably be empty.
  // Picking up the current path conditions from the Realm might be the reason why composition does not work.
  return new Effects(
    c,
    new Generator(realm, "construct_empty_effects", realm.pathConditions),
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
    this.pathConditions = [];

    if (this.useAbstractInterpretation) {
      this.preludeGenerator = new PreludeGenerator(opts.debugNames, opts.uniqueSuffix);
      ObjectValue.setupTrackedPropertyAccessors(ObjectValue.trackedPropertyNames);
      ObjectValue.setupTrackedPropertyAccessors(NativeFunctionValue.trackedPropertyNames);
      ObjectValue.setupTrackedPropertyAccessors(ProxyValue.trackedPropertyNames);
    }

    this.collectedNestedOptimizedFunctionEffects = new Map();
    this.tracers = [];

    // These get initialized in construct_realm to avoid the dependency
    this.intrinsics = ({}: any);
    this.$GlobalObject = (({}: any): ObjectValue);
    this.evaluators = (Object.create(null): any);
    this.partialEvaluators = (Object.create(null): any);
    this.$GlobalEnv = ((undefined: any): LexicalEnvironment);

    this.derivedIds = new Map();
    this.temporalEntryArgToEntries = new Map();
    this.temporalEntryCounter = 0;

    this.instantRender = {
      enabled: opts.instantRender || false,
    };

    this.react = {
      abstractHints: new WeakMap(),
      activeReconciler: undefined,
      classComponentMetadata: new Map(),
      currentOwner: undefined,
      defaultPropsHelper: undefined,
      emptyArray: undefined,
      emptyObject: undefined,
      enabled: opts.reactEnabled || false,
      hoistableFunctions: new WeakMap(),
      hoistableReactElements: new WeakMap(),
      noopFunction: undefined,
      optimizeNestedFunctions: opts.reactOptimizeNestedFunctions || false,
      output: opts.reactOutput || "create-element",
      propsWithNoPartialKeyOrRef: new WeakSet(),
      reactElements: new WeakMap(),
      reactElementStringTypeReferences: new Map(),
      reactProps: new WeakSet(),
      symbols: new Map(),
      usedReactElementKeys: new Set(),
      verbose: opts.reactVerbose || false,
    };

    this.reportSideEffectCallbacks = new Set();

    this.alreadyDescribedLocations = new WeakMap();
    this.stripFlow = opts.stripFlow || false;

    this.fbLibraries = {
      other: new Map(),
      react: undefined,
      reactDom: undefined,
      reactDomServer: undefined,
      reactNative: undefined,
      reactRelay: undefined,
    };

    this.errorHandler = opts.errorHandler;

    this.globalSymbolRegistry = [];
    this.activeLexicalEnvironments = new Set();
    this._abstractValuesDefined = new Set(); // A set of nameStrings to ensure abstract values have unique names
    this.debugNames = opts.debugNames;
    this._checkedObjectIds = new Map();
    this.optimizedFunctions = new Map();
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
  reportSideEffectCallbacks: Set<
    (sideEffectType: SideEffectType, binding: void | Binding | PropertyBinding, expressionLocation: any) => void
  >;
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

  derivedIds: Map<string, TemporalOperationEntry>;
  temporalEntryArgToEntries: Map<Value, Set<TemporalOperationEntry>>;
  temporalEntryCounter: number;

  instantRender: {
    enabled: boolean,
  };
  react: {
    // reactHints are generated to help improve the effeciency of the React reconciler when
    // operating on a tree of React components. We can use reactHint to mark AbstractValues
    // with extra data that helps us traverse through the tree that would otherwise not be possible
    // (for example, when we use Relay's React containers with "fb-www" – which are AbstractObjectValues,
    // we need to know what React component was passed to this AbstractObjectValue so we can visit it next)
    abstractHints: WeakMap<AbstractValue | ObjectValue, ReactHint>,
    activeReconciler: any, // inentionally "any", importing the React reconciler class increases Flow's cylic count
    classComponentMetadata: Map<ECMAScriptSourceFunctionValue, ClassComponentMetadata>,
    currentOwner?: ObjectValue,
    defaultPropsHelper?: ECMAScriptSourceFunctionValue,
    emptyArray: void | ArrayValue,
    emptyObject: void | ObjectValue,
    enabled: boolean,
    hoistableFunctions: WeakMap<FunctionValue, boolean>,
    hoistableReactElements: WeakMap<ObjectValue, boolean>,
    noopFunction: void | ECMAScriptSourceFunctionValue,
    optimizeNestedFunctions: boolean,
    output?: ReactOutputTypes,
    propsWithNoPartialKeyOrRef: WeakSet<ObjectValue | AbstractObjectValue>,
    reactElements: WeakMap<ObjectValue, { createdDuringReconcilation: boolean, firstRenderOnly: boolean }>,
    reactElementStringTypeReferences: Map<string, AbstractValue>,
    reactProps: WeakSet<ObjectValue>,
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
    reactNative: void | ObjectValue,
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

  collectedNestedOptimizedFunctionEffects: Map<ECMAScriptSourceFunctionValue, Effects>;
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
  debugReproManager: DebugReproManagerType | void;

  nextGeneratorId: number = 0;
  _abstractValuesDefined: Set<string>;
  _checkedObjectIds: Map<ObjectValue | AbstractObjectValue, number>;

  optimizedFunctions: Map<FunctionValue | AbstractValue, ArgModel | void>;

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
  setReadOnly(readOnlyValue: boolean): boolean {
    let oldReadOnly = this.isReadOnly;
    this.isReadOnly = readOnlyValue;
    this.$GlobalEnv.environmentRecord.isReadOnly = readOnlyValue;
    this.contextStack.forEach(ctx => {
      ctx.setReadOnly(readOnlyValue);
    });
    return oldReadOnly;
  }

  testTimeout(): void {
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

  clearBlockBindings(modifiedBindings: void | Bindings, environmentRecord: DeclarativeEnvironmentRecord): void {
    if (modifiedBindings === undefined) return;
    for (let b of modifiedBindings.keys()) {
      if (b.mightHaveBeenCaptured) continue;
      if (environmentRecord.bindings[b.name] && environmentRecord.bindings[b.name] === b) modifiedBindings.delete(b);
    }
  }

  clearBlockBindingsFromCompletion(completion: Completion, environmentRecord: DeclarativeEnvironmentRecord): void {
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
  onDestroyScope(lexicalEnvironment: LexicalEnvironment): void {
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

  markVisibleLocalBindingsAsPotentiallyCaptured(): void {
    let context = this.getRunningContext();
    if (context.function === undefined) return;
    let lexEnv = context.lexicalEnvironment;
    while (lexEnv != null) {
      let envRec = lexEnv.environmentRecord;
      if (envRec instanceof DeclarativeEnvironmentRecord) {
        let bindings = envRec.bindings;
        for (let name in bindings) {
          let binding = bindings[name];
          binding.mightHaveBeenCaptured = true;
        }
      }
      lexEnv = lexEnv.parent;
    }
  }

  clearFunctionBindings(modifiedBindings: void | Bindings, funcVal: FunctionValue): void {
    if (modifiedBindings === undefined) return;
    for (let b of modifiedBindings.keys()) {
      if (b.mightHaveBeenCaptured) continue;
      if (b.environment instanceof FunctionEnvironmentRecord && b.environment.$FunctionObject === funcVal)
        modifiedBindings.delete(b);
    }
  }

  clearFunctionBindingsFromCompletion(completion: Completion, funcVal: FunctionValue): void {
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

  assignToGlobal(name: BabelNodeLVal, value: Value): void {
    this.wrapInGlobalEnv(() => this.$GlobalEnv.assignToGlobal(name, value));
  }

  deleteGlobalBinding(name: string): void {
    this.$GlobalEnv.environmentRecord.DeleteBinding(name);
  }

  neverCheckProperty(object: ObjectValue | AbstractObjectValue, P: string): boolean {
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

  markPropertyAsChecked(object: ObjectValue | AbstractObjectValue, P: string): void {
    invariant(!this.neverCheckProperty(object, P));
    let objectId = this._checkedObjectIds.get(object);
    if (objectId === undefined) this._checkedObjectIds.set(object, (objectId = this._checkedObjectIds.size));
    let id = `__propertyHasBeenChecked__${objectId}:${P}`;
    let checkedBindings = this._getCheckedBindings();
    checkedBindings.$Set(id, this.intrinsics.true, checkedBindings);
  }

  hasBindingBeenChecked(object: ObjectValue | AbstractObjectValue, P: string): void | boolean {
    if (this.neverCheckProperty(object, P)) return true;
    let objectId = this._checkedObjectIds.get(object);
    if (objectId === undefined) return false;
    let id = `__propertyHasBeenChecked__${objectId}:${P}`;
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
    bubbleSideEffectReports: boolean,
    reportSideEffectFunc:
      | null
      | ((sideEffectType: SideEffectType, binding: void | Binding | PropertyBinding, value: void | Value) => void)
  ): T {
    let saved_createdObjectsTrackedForLeaks = this.createdObjectsTrackedForLeaks;
    let saved_reportSideEffectCallbacks;
    // Track all objects (including function closures) created during
    // this call. This will be used to make the assumption that every
    // *other* object is unchanged (pure). These objects are marked
    // as leaked if they're passed to abstract functions.
    this.createdObjectsTrackedForLeaks = new Set();
    if (reportSideEffectFunc !== null) {
      if (!bubbleSideEffectReports) {
        saved_reportSideEffectCallbacks = this.reportSideEffectCallbacks;
        this.reportSideEffectCallbacks = new Set();
      }
      this.reportSideEffectCallbacks.add(reportSideEffectFunc);
    }
    try {
      return f();
    } finally {
      this.createdObjectsTrackedForLeaks = saved_createdObjectsTrackedForLeaks;
      if (reportSideEffectFunc !== null) {
        if (!bubbleSideEffectReports && saved_reportSideEffectCallbacks !== undefined) {
          this.reportSideEffectCallbacks = saved_reportSideEffectCallbacks;
        }
        this.reportSideEffectCallbacks.delete(reportSideEffectFunc);
      }
    }
  }

  isInPureScope(): boolean {
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
        this.undoBindings(effects.modifiedBindings);
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

  // Use this to evaluate code for internal purposes, so that the tracked state does not get polluted
  evaluateWithoutEffects<T>(f: () => T): T {
    // Save old state and set up undefined state
    let savedGenerator = this.generator;
    let savedBindings = this.modifiedBindings;
    let savedProperties = this.modifiedProperties;
    let savedCreatedObjects = this.createdObjects;
    let saved_completion = this.savedCompletion;
    try {
      this.generator = undefined;
      this.modifiedBindings = undefined;
      this.modifiedProperties = undefined;
      this.createdObjects = undefined;
      this.savedCompletion = undefined;
      return f();
    } finally {
      this.generator = savedGenerator;
      this.modifiedBindings = savedBindings;
      this.modifiedProperties = savedProperties;
      this.createdObjects = savedCreatedObjects;
      this.savedCompletion = saved_completion;
    }
  }

  evaluateForEffects(f: () => Completion | Value, state: any, generatorName: string): Effects {
    // Save old state and set up empty state
    let [savedBindings, savedProperties] = this.getAndResetModifiedMaps();
    let saved_generator = this.generator;
    let saved_createdObjects = this.createdObjects;
    let saved_completion = this.savedCompletion;
    this.generator = new Generator(this, generatorName, this.pathConditions);
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
          else if (c instanceof SimpleNormalCompletion) c = c.value;
        } catch (e) {
          if (e instanceof AbruptCompletion) c = e;
          else throw e;
        }
        // This is a join point for the normal branch of a PossiblyNormalCompletion.
        if (c instanceof Value || c instanceof AbruptCompletion) {
          c = Functions.incorporateSavedCompletion(this, c);
          if (c instanceof Completion && c.effects !== undefined) c = c.shallowCloneWithoutEffects();
        }
        invariant(c !== undefined);
        if (c instanceof PossiblyNormalCompletion) {
          // The current state may have advanced since the time control forked into the various paths recorded in c.
          // Update the normal path and restore the global state to what it was at the time of the fork.
          let subsequentEffects = this.getCapturedEffects(c.value);
          this.stopEffectCaptureAndUndoEffects(c);
          Join.updatePossiblyNormalCompletionWithSubsequentEffects(this, c, subsequentEffects);
          this.savedCompletion = undefined;
          this.applyEffects(subsequentEffects, "subsequentEffects", true);
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
        if (c instanceof Value) c = new SimpleNormalCompletion(c);
        result = new Effects(c, astGenerator, astBindings, astProperties, astCreatedObjects);
        return result;
      } finally {
        // Roll back the state changes
        if (this.savedCompletion !== undefined) this.stopEffectCaptureAndUndoEffects(this.savedCompletion);
        if (result !== undefined) {
          this.undoBindings(result.modifiedBindings);
          this.restoreProperties(result.modifiedProperties);
        } else {
          this.undoBindings(this.modifiedBindings);
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
      return effects.result instanceof SimpleNormalCompletion ? effects.result.value : defaultValue;
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
      invariant(resultVal instanceof SimpleNormalCompletion);
      return resultVal.value;
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
        invariant(result instanceof Completion);
        return result;
      };
      let effects1 = this.evaluateForEffects(f, undefined, "evaluateForFixpointEffects/1");
      while (true) {
        this.redoBindings(effects1.modifiedBindings);
        this.restoreProperties(effects1.modifiedProperties);
        let effects2 = this.evaluateForEffects(f, undefined, "evaluateForFixpointEffects/2");
        this.undoBindings(effects1.modifiedBindings);
        this.restoreProperties(effects1.modifiedProperties);
        if (Widen.containsEffects(effects1, effects2)) {
          // effects1 includes every value present in effects2, so doing another iteration using effects2 will not
          // result in any more values being added to abstract domains and hence a fixpoint has been reached.
          // Generate code using effects2 because its expressions have not been widened away.
          const e2 = effects2;
          this._applyPropertiesToNewlyCreatedObjects(e2.modifiedProperties, e2.createdObjects);
          this._emitPropertyAssignments(e2.generator, e2.modifiedProperties, e2.createdObjects);
          this._emitLocalAssignments(e2.generator, e2.modifiedBindings, e2.createdObjects);
          invariant(test instanceof AbstractValue);
          let cond = e2.generator.deriveAbstract(
            test.types,
            test.values,
            [test],
            createOperationDescriptor("SINGLE_ARG"),
            { skipInvariant: true }
          );
          return [effects1, effects2, cond];
        }
        effects1 = Widen.widenEffects(this, effects1, effects2);
      }
    } catch (e) {
      if (e instanceof FatalError) return undefined;
      throw e;
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
    invariant(effects1 === undefined || effects1.result.effects === effects1);

    let effects2;
    try {
      effects2 = Path.withInverseCondition(condValue, alternateEffectsFunc);
    } catch (e) {
      if (!(e instanceof InfeasiblePathError)) throw e;
    }
    invariant(effects2 === undefined || effects2.result.effects === effects2);

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
        this.applyEffects(joinedEffects, "evaluateWithAbstractConditional");
        completion = this.composeWithSavedCompletion(completion);
      } else {
        this.applyEffects(joinedEffects, "evaluateWithAbstractConditional");
      }
    }

    // return or throw completion
    if (completion instanceof AbruptCompletion) throw completion;
    if (completion instanceof SimpleNormalCompletion) completion = completion.value;
    invariant(completion instanceof Value);
    return completion;
  }

  _applyPropertiesToNewlyCreatedObjects(
    modifiedProperties: void | PropertyBindings,
    newlyCreatedObjects: CreatedObjects
  ): void {
    if (modifiedProperties === undefined) return;
    modifiedProperties.forEach((desc, propertyBinding, m) => {
      if (newlyCreatedObjects.has(propertyBinding.object)) {
        propertyBinding.descriptor = desc;
      }
    });
  }

  // populate the loop body generator with assignments that will update the phiNodes
  _emitLocalAssignments(gen: Generator, bindings: Bindings, newlyCreatedObjects: CreatedObjects): void {
    let tvalFor: Map<any, AbstractValue> = new Map();
    bindings.forEach((binding, key, map) => {
      let val = binding.value;
      if (val instanceof AbstractValue) {
        invariant(val.operationDescriptor !== undefined);
        let tval = gen.deriveAbstract(val.types, val.values, [val], createOperationDescriptor("SINGLE_ARG"));
        tvalFor.set(key, tval);
      }
    });
    bindings.forEach((binding, key, map) => {
      let val = binding.value;
      if (val instanceof AbstractValue) {
        let phiNode = key.phiNode;
        let tval = tvalFor.get(key);
        invariant(tval !== undefined);
        gen.emitStatement([tval], createOperationDescriptor("LOCAL_ASSIGNMENT", { value: phiNode }));
      }

      if (val instanceof ObjectValue && newlyCreatedObjects.has(val)) {
        let phiNode = key.phiNode;
        gen.emitStatement([val], createOperationDescriptor("LOCAL_ASSIGNMENT", { value: phiNode }));
      }
    });
  }

  // populate the loop body generator with assignments that will update properties modified inside the loop
  _emitPropertyAssignments(gen: Generator, pbindings: PropertyBindings, newlyCreatedObjects: CreatedObjects): void {
    let tvalFor: Map<any, AbstractValue> = new Map();
    pbindings.forEach((val, key, map) => {
      if (newlyCreatedObjects.has(key.object) || key.object.refuseSerialization) {
        return;
      }
      let value = val && val.value;
      if (value instanceof AbstractValue) {
        invariant(value.operationDescriptor !== undefined);
        let tval = gen.deriveAbstract(
          value.types,
          value.values,
          [key.object, value],
          createOperationDescriptor("LOGICAL_PROPERTY_ASSIGNMENT", { binding: key, value }),
          {
            skipInvariant: true,
          }
        );
        tvalFor.set(key, tval);
      }
    });
    pbindings.forEach((val, key, map) => {
      if (newlyCreatedObjects.has(key.object) || key.object.refuseSerialization) {
        return;
      }
      let path = key.pathNode;
      let tval = tvalFor.get(key);
      invariant(val !== undefined);
      let value = val.value;
      invariant(value instanceof Value);
      let keyKey = key.key;
      if (typeof keyKey === "string") {
        if (path !== undefined) {
          gen.emitStatement(
            [key.object, tval || value, this.intrinsics.empty, new StringValue(this, keyKey)],
            createOperationDescriptor("CONDITIONAL_PROPERTY_ASSIGNMENT", { path, value })
          );
        } else {
          // RH value was not widened, so it must have been a constant. We don't need to assign that inside the loop.
          // Note, however, that if the LH side is a property of an intrinsic object, then an assignment will
          // have been emitted to the generator.
        }
      } else {
        // TODO: What if keyKey is undefined?
        invariant(keyKey instanceof Value);
        gen.emitStatement(
          [key.object, keyKey, tval || value, this.intrinsics.empty],
          createOperationDescriptor("PROPERTY_ASSIGNMENT", { path })
        );
      }
    });
  }

  composeEffects(priorEffects: Effects, subsequentEffects: Effects): Effects {
    let result = construct_empty_effects(this, subsequentEffects.result.shallowCloneWithoutEffects());

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

  updateAbruptCompletions(priorEffects: Effects, c: PossiblyNormalCompletion): void {
    if (c.consequent instanceof AbruptCompletion) {
      c.consequent.effects = this.composeEffects(priorEffects, c.consequentEffects);
      let alternate = c.alternate;
      if (alternate instanceof PossiblyNormalCompletion) this.updateAbruptCompletions(priorEffects, alternate);
    } else {
      invariant(c.alternate instanceof AbruptCompletion);
      c.alternate.effects = this.composeEffects(priorEffects, c.alternateEffects);
      let consequent = c.consequent;
      if (consequent instanceof PossiblyNormalCompletion) this.updateAbruptCompletions(priorEffects, consequent);
    }
  }

  wrapSavedCompletion(completion: PossiblyNormalCompletion): void {
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
      let e = this.getCapturedEffects();
      this.stopEffectCaptureAndUndoEffects(savedCompletion);
      savedCompletion = Join.composePossiblyNormalCompletions(this, savedCompletion, completion, e);
      this.applyEffects(e);
      this.captureEffects(savedCompletion);
      this.savedCompletion = savedCompletion;
    }
    let realm = this;
    pushPathConditionsLeadingToNormalCompletion(completion);
    return completion.value;

    function pushPathConditionsLeadingToNormalCompletion(c: ForkedAbruptCompletion | PossiblyNormalCompletion) {
      if (allPathsAreAbrupt(c.consequent)) {
        Path.pushInverseAndRefine(c.joinCondition);
        if (c.alternate instanceof PossiblyNormalCompletion || c.alternate instanceof ForkedAbruptCompletion)
          pushPathConditionsLeadingToNormalCompletion(c.alternate);
      } else if (allPathsAreAbrupt(c.alternate)) {
        Path.pushAndRefine(c.joinCondition);
        if (c.consequent instanceof PossiblyNormalCompletion || c.consequent instanceof ForkedAbruptCompletion)
          pushPathConditionsLeadingToNormalCompletion(c.consequent);
      } else if (allPathsAreNormal(c.consequent)) {
        if (!allPathsAreNormal(c.alternate)) {
          let alternatePC = getNormalPathConditionFor(c.alternate);
          let disjunct = AbstractValue.createFromLogicalOp(realm, "||", c.joinCondition, alternatePC);
          Path.pushAndRefine(disjunct);
        }
      } else if (allPathsAreNormal(c.alternate)) {
        let consequentPC = getNormalPathConditionFor(c.consequent);
        let inverse = AbstractValue.createFromUnaryOp(realm, "!", c.joinCondition);
        let disjunct = AbstractValue.createFromLogicalOp(realm, "||", inverse, consequentPC);
        Path.pushAndRefine(disjunct);
      } else {
        let jc = c.joinCondition;
        let consequentPC = AbstractValue.createFromLogicalOp(realm, "&&", jc, getNormalPathConditionFor(c.consequent));
        let ijc = AbstractValue.createFromUnaryOp(realm, "!", jc);
        let alternatePC = AbstractValue.createFromLogicalOp(realm, "&&", ijc, getNormalPathConditionFor(c.alternate));
        let disjunct = AbstractValue.createFromLogicalOp(realm, "||", consequentPC, alternatePC);
        Path.pushAndRefine(disjunct);
      }
    }

    function allPathsAreAbrupt(c: Completion): boolean {
      if (c instanceof ForkedAbruptCompletion) return allPathsAreAbrupt(c.consequent) && allPathsAreAbrupt(c.alternate);
      if (c instanceof AbruptCompletion) return true;
      return false;
    }

    function allPathsAreNormal(c: Completion): boolean {
      if (c instanceof PossiblyNormalCompletion || c instanceof ForkedAbruptCompletion)
        return allPathsAreNormal(c.consequent) && allPathsAreNormal(c.alternate);
      if (c instanceof AbruptCompletion) return false;
      return true;
    }

    function getNormalPathConditionFor(c: Completion): Value {
      invariant(c instanceof PossiblyNormalCompletion || c instanceof ForkedAbruptCompletion);
      if (allPathsAreAbrupt(c.consequent)) {
        invariant(!allPathsAreAbrupt(c.alternate));
        let inverse = AbstractValue.createFromUnaryOp(realm, "!", c.joinCondition);
        if (allPathsAreNormal(c.alternate)) return inverse;
        return AbstractValue.createFromLogicalOp(realm, "&&", inverse, getNormalPathConditionFor(c.alternate));
      } else if (allPathsAreAbrupt(c.alternate)) {
        invariant(!allPathsAreAbrupt(c.consequent));
        if (allPathsAreNormal(c.consequent)) return c.joinCondition;
        return AbstractValue.createFromLogicalOp(realm, "&&", c.joinCondition, getNormalPathConditionFor(c.consequent));
      } else if (allPathsAreNormal(c.consequent)) {
        // In principle the simplifier shoud reduce the result of the else clause to this case. This does less work.
        invariant(!allPathsAreNormal(c.alternate));
        invariant(!allPathsAreAbrupt(c.alternate));
        let ijc = AbstractValue.createFromUnaryOp(realm, "!", c.joinCondition);
        let alternatePC = AbstractValue.createFromLogicalOp(realm, "&&", ijc, getNormalPathConditionFor(c.alternate));
        return AbstractValue.createFromLogicalOp(realm, "||", c.joinCondition, alternatePC);
      } else if (allPathsAreNormal(c.alternate)) {
        // In principle the simplifier shoud reduce the result of the else clause to this case. This does less work.
        invariant(!allPathsAreNormal(c.consequent));
        invariant(!allPathsAreAbrupt(c.consequent));
        let jc = c.joinCondition;
        let consequentPC = AbstractValue.createFromLogicalOp(realm, "&&", jc, getNormalPathConditionFor(c.consequent));
        let ijc = AbstractValue.createFromUnaryOp(realm, "!", jc);
        return AbstractValue.createFromLogicalOp(realm, "||", consequentPC, ijc);
      } else {
        let jc = c.joinCondition;
        let consequentPC = AbstractValue.createFromLogicalOp(realm, "&&", jc, getNormalPathConditionFor(c.consequent));
        let ijc = AbstractValue.createFromUnaryOp(realm, "!", jc);
        let alternatePC = AbstractValue.createFromLogicalOp(realm, "&&", ijc, getNormalPathConditionFor(c.alternate));
        return AbstractValue.createFromLogicalOp(realm, "||", consequentPC, alternatePC);
      }
    }
  }

  incorporatePriorSavedCompletion(priorCompletion: void | PossiblyNormalCompletion): void {
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
      this.redoBindings(savedEffects.modifiedBindings);
      this.restoreProperties(savedEffects.modifiedProperties);
      Join.updatePossiblyNormalCompletionWithSubsequentEffects(this, priorCompletion, savedEffects);
      this.undoBindings(savedEffects.modifiedBindings);
      this.restoreProperties(savedEffects.modifiedProperties);
      invariant(this.savedCompletion !== undefined);
      this.savedCompletion.savedEffects = undefined;
      this.savedCompletion = Join.composePossiblyNormalCompletions(this, priorCompletion, this.savedCompletion);
    }
  }

  captureEffects(completion: PossiblyNormalCompletion): void {
    invariant(completion.savedEffects === undefined);
    completion.savedEffects = new Effects(
      new SimpleNormalCompletion(this.intrinsics.undefined),
      (this.generator: any),
      (this.modifiedBindings: any),
      (this.modifiedProperties: any),
      (this.createdObjects: any)
    );
    this.generator = new Generator(this, "captured", this.pathConditions);
    this.modifiedBindings = new Map();
    this.modifiedProperties = new Map();
    this.createdObjects = new Set();
  }

  getCapturedEffects(v?: Value = this.intrinsics.undefined): Effects {
    invariant(this.generator !== undefined);
    invariant(this.modifiedBindings !== undefined);
    invariant(this.modifiedProperties !== undefined);
    invariant(this.createdObjects !== undefined);
    return new Effects(
      new SimpleNormalCompletion(v),
      this.generator,
      this.modifiedBindings,
      this.modifiedProperties,
      this.createdObjects
    );
  }

  stopEffectCaptureAndUndoEffects(completion: PossiblyNormalCompletion): void {
    // Roll back the state changes
    this.undoBindings(this.modifiedBindings);
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
  applyEffects(effects: Effects, leadingComment: string = "", appendGenerator: boolean = true): void {
    invariant(
      effects.canBeApplied,
      "Effects have been applied and not properly reverted. It is not safe to apply them a second time."
    );
    effects.canBeApplied = false;
    let { generator, modifiedBindings, modifiedProperties, createdObjects } = effects;

    // Add generated code for property modifications
    if (appendGenerator) this.appendGenerator(generator, leadingComment);

    // Restore modifiedBindings
    this.redoBindings(modifiedBindings);
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
      while (env) {
        if (env.environmentRecord === root && !env.destroyed) {
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
      this.isInPureScope()
    ) {
      let env = binding.environment;

      if (
        !(env instanceof DeclarativeEnvironmentRecord) ||
        (env instanceof DeclarativeEnvironmentRecord && !isDefinedInsidePureFn(env))
      ) {
        for (let callback of this.reportSideEffectCallbacks) {
          callback("MODIFIED_BINDING", binding, value.expressionLocation);
        }
      }
    }

    if (binding.environment.isReadOnly) {
      // This only happens during speculative execution and is reported elsewhere
      throw new FatalError("Trying to modify a binding in read-only realm");
    }

    if (this.modifiedBindings !== undefined && !this.modifiedBindings.has(binding)) {
      this.modifiedBindings.set(binding, {
        hasLeaked: undefined,
        value: undefined,
        previousHasLeaked: binding.hasLeaked,
        previousValue: binding.value,
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

      if (
        createdObjectsTrackedForLeaks !== undefined &&
        !createdObjectsTrackedForLeaks.has(object) &&
        // __markPropertyAsChecked__ is set by realm.markPropertyAsChecked
        (typeof binding.key !== "string" || !binding.key.includes("__propertyHasBeenChecked__")) &&
        binding.key !== "_temporalAlias"
      ) {
        if (binding.object === this.$GlobalObject) {
          for (let callback of this.reportSideEffectCallbacks) {
            callback("MODIFIED_GLOBAL", binding, object.expressionLocation);
          }
        } else {
          for (let callback of this.reportSideEffectCallbacks) {
            callback("MODIFIED_PROPERTY", binding, object.expressionLocation);
          }
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

  redoBindings(modifiedBindings: void | Bindings): void {
    if (modifiedBindings === undefined) return;
    modifiedBindings.forEach(({ hasLeaked, value }, binding, m) => {
      binding.hasLeaked = hasLeaked || false;
      binding.value = value;
    });
  }

  undoBindings(modifiedBindings: void | Bindings): void {
    if (modifiedBindings === undefined) return;
    modifiedBindings.forEach((entry, binding, m) => {
      if (entry.hasLeaked === undefined) entry.hasLeaked = binding.hasLeaked;
      if (entry.value === undefined) entry.value = binding.value;
      binding.hasLeaked = entry.previousHasLeaked || false;
      binding.value = entry.previousValue;
    });
  }

  // Restores each PropertyBinding in the given map to the value it
  // had when it was entered into the map and updates the map to record
  // the value the Binding had just before the call to this method.
  restoreProperties(modifiedProperties: void | PropertyBindings): void {
    if (modifiedProperties === undefined) return;
    modifiedProperties.forEach((desc, propertyBinding, m) => {
      let d = propertyBinding.descriptor;
      propertyBinding.descriptor = desc;
      m.set(propertyBinding, d);
    });
  }

  // Provide the realm with maps in which to track modifications.
  // A map can be set to undefined if no tracking is required.
  setModifiedMaps(modifiedBindings: void | Bindings, modifiedProperties: void | PropertyBindings): void {
    this.modifiedBindings = modifiedBindings;
    this.modifiedProperties = modifiedProperties;
  }

  rebuildObjectProperty(object: Value, key: string, propertyValue: Value, path: string): void {
    if (!(propertyValue instanceof AbstractValue)) return;
    if (propertyValue.kind === "abstractConcreteUnion") {
      let absVal = propertyValue.args.find(e => e instanceof AbstractValue);
      invariant(absVal instanceof AbstractValue);
      propertyValue = absVal;
    }
    if (!propertyValue.isIntrinsic()) {
      propertyValue.intrinsicName = `${path}.${key}`;
      propertyValue.kind = "rebuiltProperty";
      propertyValue.args = [object, new StringValue(this, key)];
      propertyValue.operationDescriptor = createOperationDescriptor("REBUILT_OBJECT");
      let intrinsicName = propertyValue.intrinsicName;
      invariant(intrinsicName !== undefined);
      this.rebuildNestedProperties(propertyValue, intrinsicName);
    }
  }

  rebuildNestedProperties(abstractValue: AbstractValue | UndefinedValue, path: string): void {
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

  setNextExecutionContextLocation(loc: ?BabelNodeSourceLocation): ?BabelNodeSourceLocation {
    let previousValue = this.nextContextLocation;
    this.nextContextLocation = loc;
    return previousValue;
  }

  reportIntrospectionError(message?: void | string | StringValue): void {
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
    return new ThrowCompletion(Construct(this, type, [message]), undefined, this.currentLocation);
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
      let error = this.evaluateWithoutEffects(() => Construct(this, this.intrinsics.Error));
      let stack = error._SafeGetDataPropertyValue("stack");
      if (stack instanceof StringValue) diagnostic.callStack = stack.value;
    }

    // If debugger is attached, give it a first crack so that it can
    // stop execution for debugging before PP exits.
    if (this.debuggerInstance && this.debuggerInstance.shouldStopForSeverity(diagnostic.severity)) {
      this.debuggerInstance.handlePrepackError(diagnostic);
    }

    // If we're creating a DebugRepro, attach the sourceFile names to the error that is returned.
    if (this.debugReproManager !== undefined) {
      let manager = this.debugReproManager;
      let sourcePaths = {
        sourceFiles: manager.getSourceFilePaths(),
        sourceMaps: manager.getSourceMapPaths(),
      };
      diagnostic.sourceFilePaths = sourcePaths;
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
    return errorHandler(diagnostic, this.suppressDiagnostics);
  }

  saveNameString(nameString: string): void {
    this._abstractValuesDefined.add(nameString);
  }

  isNameStringUnique(nameString: string): boolean {
    return !this._abstractValuesDefined.has(nameString);
  }

  getTemporalOperationEntryFromDerivedValue(value: Value): void | TemporalOperationEntry {
    let name = value.intrinsicName;
    if (!name) {
      return undefined;
    }
    let temporalOperationEntry = value.$Realm.derivedIds.get(name);
    return temporalOperationEntry;
  }

  getTemporalGeneratorEntriesReferencingArg(arg: AbstractValue | ObjectValue): void | Set<TemporalOperationEntry> {
    return this.temporalEntryArgToEntries.get(arg);
  }

  saveTemporalGeneratorEntryArgs(temporalOperationEntry: TemporalOperationEntry): void {
    let args = temporalOperationEntry.args;
    for (let arg of args) {
      let temporalEntries = this.temporalEntryArgToEntries.get(arg);

      if (temporalEntries === undefined) {
        temporalEntries = new Set();
        this.temporalEntryArgToEntries.set(arg, temporalEntries);
      }
      temporalEntries.add(temporalOperationEntry);
    }
  }
}
