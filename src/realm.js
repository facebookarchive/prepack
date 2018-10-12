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
  ArgModel,
  ClassComponentMetadata,
  ConsoleMethodTypes,
  DebugReproManagerType,
  DebugServerType,
  Descriptor,
  DisplayResult,
  Intrinsics,
  PathConditions,
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
import { TypesDomain, ValuesDomain } from "./domains/index.js";
import {
  LexicalEnvironment,
  Reference,
  GlobalEnvironmentRecord,
  FunctionEnvironmentRecord,
  DeclarativeEnvironmentRecord,
} from "./environment.js";
import type { Binding } from "./environment.js";
import { Construct } from "./methods/index.js";
import {
  AbruptCompletion,
  Completion,
  JoinedAbruptCompletions,
  JoinedNormalAndAbruptCompletions,
  NormalCompletion,
  SimpleNormalCompletion,
  ThrowCompletion,
} from "./completions.js";
import type { Compatibility, RealmOptions, ReactOutputTypes, InvariantModeTypes } from "./options.js";
import invariant from "./invariant.js";
import seedrandom from "seedrandom";
import { createOperationDescriptor, Generator, type TemporalOperationEntry } from "./utils/generator.js";
import { PreludeGenerator } from "./utils/PreludeGenerator.js";
import {
  createPathConditions,
  Environment,
  Functions,
  Join,
  Path,
  Properties,
  To,
  Utils,
  Widen,
} from "./singletons.js";
import type { ReactSymbolTypes } from "./react/utils.js";
import {
  cloneDescriptor,
  AbstractJoinedDescriptor,
  InternalSlotDescriptor,
  PropertyDescriptor,
} from "./descriptors.js";
import type { BabelNode, BabelNodeSourceLocation, BabelNodeLVal } from "@babel/types";
export type BindingEntry = { hasLeaked: boolean, value: void | Value };
export type Bindings = Map<Binding, BindingEntry>;
export type EvaluationResult = Completion | Reference;
export type PropertyBindings = Map<PropertyBinding, void | Descriptor>;

export type CreatedObjects = Set<ObjectValue>;
export type CreatedAbstracts = Set<AbstractValue>;

export type SideEffectType = "MODIFIED_BINDING" | "MODIFIED_PROPERTY" | "MODIFIED_GLOBAL";

export type SideEffectCallback = (
  sideEffectType: SideEffectType,
  binding: void | Binding | PropertyBinding,
  expressionLocation: any
) => void;

let effects_uid = 0;

export class Effects {
  constructor(
    result: Completion,
    generator: Generator,
    bindings: Bindings,
    propertyBindings: PropertyBindings,
    createdObjects: CreatedObjects,
    createdAbstracts: CreatedAbstracts
  ) {
    this.result = result;
    this.generator = generator;
    this.modifiedBindings = bindings;
    this.modifiedProperties = propertyBindings;
    this.createdObjects = createdObjects;
    this.createdAbstracts = createdAbstracts;

    this.canBeApplied = true;
    this._id = effects_uid++;
  }

  result: Completion;
  generator: Generator;
  modifiedBindings: Bindings;
  modifiedProperties: PropertyBindings;
  createdObjects: CreatedObjects;
  createdAbstracts: CreatedAbstracts;
  canBeApplied: boolean;
  _id: number;

  shallowCloneWithResult(result: Completion): Effects {
    return new Effects(
      result,
      this.generator,
      this.modifiedBindings,
      this.modifiedProperties,
      this.createdObjects,
      this.createdAbstracts
    );
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
  c: Completion = new SimpleNormalCompletion(realm.intrinsics.empty)
): Effects {
  return new Effects(
    c,
    new Generator(realm, "construct_empty_effects", realm.pathConditions),
    new Map(),
    new Map(),
    new Set(),
    new Set()
  );
}

export class Realm {
  constructor(opts: RealmOptions, statistics: RealmStatistics) {
    this.statistics = statistics;
    this.isReadOnly = false;
    this.useAbstractInterpretation = opts.serialize === true || Array.isArray(opts.check);
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
    this.remainingCalls = opts.maxStackDepth || 112;
    this.invariantLevel = opts.invariantLevel || 0;
    this.invariantMode = opts.invariantMode || "throw";
    this.emitConcreteModel = !!opts.emitConcreteModel;

    this.$TemplateMap = [];
    this.pathConditions = createPathConditions();

    if (this.useAbstractInterpretation) {
      this.preludeGenerator = new PreludeGenerator(opts.debugNames, opts.uniqueSuffix);
      ObjectValue.setupTrackedPropertyAccessors(ObjectValue.trackedPropertyNames);
      ObjectValue.setupTrackedPropertyAccessors(NativeFunctionValue.trackedPropertyNames);
      ObjectValue.setupTrackedPropertyAccessors(ProxyValue.trackedPropertyNames);
    }

    this.collectedNestedOptimizedFunctionEffects = new Map();
    this.moduleFactoryFunctionsToRemove = new Map();
    this.tracers = [];

    // These get initialized in construct_realm to avoid the dependency
    this.intrinsics = ({}: any);
    this.$GlobalObject = (({}: any): ObjectValue);
    this.evaluators = (Object.create(null): any);
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
      failOnUnsupportedSideEffects: opts.reactFailOnUnsupportedSideEffects === false ? false : true,
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
    this.arrayNestedOptimizedFunctionsEnabled =
      opts.arrayNestedOptimizedFunctionsEnabled || opts.instantRender || false;
    this.removeModuleFactoryFunctions = opts.removeModuleFactoryFunctions || false;
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
  remainingCalls: number;
  invariantLevel: number;
  invariantMode: InvariantModeTypes;
  ignoreLeakLogic: boolean;
  emitConcreteModel: boolean;

  abstractValueImpliesMax: number;
  abstractValueImpliesCounter: number;
  impliesCounterOverflowed: boolean;
  inSimplificationPath: boolean;

  modifiedBindings: void | Bindings;
  modifiedProperties: void | PropertyBindings;
  createdObjects: void | CreatedObjects;
  createdObjectsTrackedForLeaks: void | CreatedObjects;
  createdAbstracts: void | CreatedAbstracts;
  reportObjectGetOwnProperties: void | ((ObjectValue | AbstractObjectValue) => void);
  reportPropertyAccess: void | ((PropertyBinding, boolean) => void);
  savedCompletion: void | JoinedNormalAndAbruptCompletions;

  activeLexicalEnvironments: Set<LexicalEnvironment>;

  // A set of abstract conditions that are known to be true in the current execution path.
  // For example, the abstract condition of an if statement is known to be true inside its true branch.
  pathConditions: PathConditions;

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
    classComponentMetadata: Map<ECMAScriptSourceFunctionValue | BoundFunctionValue, ClassComponentMetadata>,
    currentOwner?: ObjectValue,
    defaultPropsHelper?: ECMAScriptSourceFunctionValue,
    emptyArray: void | ArrayValue,
    emptyObject: void | ObjectValue,
    enabled: boolean,
    failOnUnsupportedSideEffects: boolean,
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
  simplifyAndRefineAbstractValue: AbstractValue => Value;
  simplifyAndRefineAbstractCondition: AbstractValue => Value;

  collectedNestedOptimizedFunctionEffects: Map<ECMAScriptSourceFunctionValue, Effects>;
  removeModuleFactoryFunctions: boolean;
  moduleFactoryFunctionsToRemove: Map<number, string>;
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
  arrayNestedOptimizedFunctionsEnabled: boolean;
  currentOptimizedFunction: FunctionValue | void;

  eagerlyRequireModuleDependencies: void | boolean;

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
      }
    }

    // Ensures if we call onDestroyScope too early, there will be a failure.
    this.activeLexicalEnvironments.delete(lexicalEnvironment);
    lexicalEnvironment.destroy();
  }

  startCall() {
    if (this.remainingCalls === 0) {
      let error = new CompilerDiagnostic("Maximum stack depth exceeded", this.currentLocation, "PP0045", "FatalError");
      this.handleError(error);
      throw new FatalError();
    }
    this.remainingCalls--;
  }

  endCall() {
    this.remainingCalls++;
  }

  pushContext(context: ExecutionContext): void {
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

  popContext(context: ExecutionContext): void {
    let funcVal = context.function;
    if (funcVal) {
      this.clearFunctionBindings(this.modifiedBindings, funcVal);
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
    let checkedBindingsObject = binding.descriptor && binding.descriptor.throwIfNotConcrete(this).value;
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
    let value = binding.descriptor && binding.descriptor.throwIfNotConcrete(this).value;
    return value instanceof Value && !value.mightNotBeTrue();
  }

  // Evaluate a context as if it won't have any side-effects outside of any objects
  // that it created itself. This promises that any abstract functions inside of it
  // also won't have effects on any objects or bindings that weren't created in this
  // call.
  evaluateWithPureScope<T>(f: () => T): T {
    invariant(
      this.createdObjectsTrackedForLeaks === undefined,
      "evaluateWithPureScope cannot have nested evalautePure scopes"
    );
    let saved_createdObjectsTrackedForLeaks = this.createdObjectsTrackedForLeaks;
    this.createdObjectsTrackedForLeaks = new Set();
    try {
      return f();
    } finally {
      if (saved_createdObjectsTrackedForLeaks === undefined) {
        this.createdObjectsTrackedForLeaks = undefined;
      } else {
        this.createdObjectsTrackedForLeaks = saved_createdObjectsTrackedForLeaks;
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
    // We could use the outcome of that as the join condition for a JoinedNormalAndAbruptCompletions.
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

  evaluateFunctionForPureEffectsInGlobalEnv(
    func: FunctionValue,
    f: () => Value,
    sideEffectCallback: SideEffectCallback,
    state?: any,
    generatorName?: string = "evaluateFunctionForPureEffectsInGlobalEnv"
  ): Effects {
    return this.wrapInGlobalEnv(() =>
      this.evaluateFunctionForPureEffects(func, f, state, generatorName, sideEffectCallback)
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
        this.restoreBindings(effects.modifiedBindings);
        this.restoreProperties(effects.modifiedProperties);
        invariant(!effects.canBeApplied);
        effects.canBeApplied = true;
      }
    });
    invariant(result !== undefined, "If we get here, func must have returned undefined.");
    return result;
  }

  withNewOptimizedFunction<T>(func: () => T, optimizedFunction: FunctionValue): T {
    let result: T;
    let previousOptimizedFunction = this.currentOptimizedFunction;
    this.currentOptimizedFunction = optimizedFunction;
    try {
      result = func();
    } finally {
      this.currentOptimizedFunction = previousOptimizedFunction;
    }
    return result;
  }

  evaluateNodeForEffectsInGlobalEnv(node: BabelNode, state?: any, generatorName?: string): Effects {
    return this.wrapInGlobalEnv(() => this.evaluateNodeForEffects(node, false, this.$GlobalEnv, state, generatorName));
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
      this.generator = new Generator(this, "evaluateIgnoringEffects", this.pathConditions);
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

  evaluateFunctionForPureEffects(
    func: FunctionValue,
    f: () => Completion | Value,
    state: any,
    generatorName: string,
    sideEffectCallback: SideEffectCallback
  ): Effects {
    let effects = this.evaluateForEffects(f, state, generatorName);
    Utils.reportSideEffectsFromEffects(this, effects, func, sideEffectCallback);
    return effects;
  }

  evaluateForEffects(f: () => Completion | Value, state: any, generatorName: string): Effects {
    // Save old state and set up empty state
    let [savedBindings, savedProperties] = this.getAndResetModifiedMaps();
    let saved_generator = this.generator;
    let saved_createdObjects = this.createdObjects;
    let saved_createdAbstracts = this.createdAbstracts;
    let saved_completion = this.savedCompletion;
    let saved_abstractValuesDefined = this._abstractValuesDefined;
    this.generator = new Generator(this, generatorName, this.pathConditions);
    this.createdObjects = new Set();
    this.createdAbstracts = new Set();
    this.savedCompletion = undefined; // while in this call, we only explore the normal path.
    this._abstractValuesDefined = new Set(saved_abstractValuesDefined);

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
        // This is a join point for any normal completions inside realm.savedCompletion
        c = Functions.incorporateSavedCompletion(this, c);
        invariant(c !== undefined);

        invariant(this.generator !== undefined);
        invariant(this.modifiedBindings !== undefined);
        invariant(this.modifiedProperties !== undefined);
        invariant(this.createdObjects !== undefined);
        let astGenerator = this.generator;
        let astBindings = this.modifiedBindings;
        let astProperties = this.modifiedProperties;
        let astCreatedObjects = this.createdObjects;
        let astCreatedAbstracts = this.createdAbstracts;

        /* TODO #1615: The following invariant should hold.

        // Check invariant that modified bindings to not refer to environment record belonging to
        // newly created closure objects.
        for (let binding of astBindings.keys())
          if (binding.environment instanceof FunctionEnvironmentRecord)
            invariant(!astCreatedObjects.has(binding.environment.$FunctionObject));
        */

        // Return the captured state changes and evaluation result
        if (c instanceof Value) c = new SimpleNormalCompletion(c);
        invariant(astCreatedAbstracts !== undefined);
        result = new Effects(c, astGenerator, astBindings, astProperties, astCreatedObjects, astCreatedAbstracts);
        return result;
      } finally {
        // Roll back the state changes
        if (result !== undefined) {
          this.restoreBindings(result.modifiedBindings);
          this.restoreProperties(result.modifiedProperties);
        } else {
          this.restoreBindings(this.modifiedBindings);
          this.restoreProperties(this.modifiedProperties);
          let completion = this.savedCompletion;
          while (completion !== undefined) {
            const { savedEffects } = completion;
            if (savedEffects !== undefined) {
              this.restoreBindings(savedEffects.modifiedBindings);
              this.restoreProperties(savedEffects.modifiedProperties);
            }
            completion = completion.composedWith;
          }
        }
        this.generator = saved_generator;
        this.modifiedBindings = savedBindings;
        this.modifiedProperties = savedProperties;
        this.createdObjects = saved_createdObjects;
        this.createdAbstracts = saved_createdAbstracts;
        this.savedCompletion = saved_completion;
        this._abstractValuesDefined = saved_abstractValuesDefined;
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
    condValue: Value,
    consequentEffectsFunc: () => Effects,
    alternateEffectsFunc: () => Effects
  ): Value {
    let effects;
    if (Path.implies(condValue)) {
      effects = consequentEffectsFunc();
    } else if (Path.impliesNot(condValue)) {
      effects = alternateEffectsFunc();
    } else {
      // Join effects
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

      if (effects1 === undefined || effects2 === undefined) {
        if (effects1 === undefined && effects2 === undefined) throw new InfeasiblePathError();
        effects = effects1 || effects2;
        invariant(effects !== undefined);
      } else {
        // Join the effects, creating an abstract view of what happened, regardless
        // of the actual value of condValue.
        effects = Join.joinEffects(condValue, effects1, effects2);
      }
    }
    this.applyEffects(effects);

    return condValue.$Realm.returnOrThrowCompletion(effects.result);
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
      let value = val && val.throwIfNotConcrete(this).value;
      if (value instanceof AbstractValue) {
        invariant(value.operationDescriptor !== undefined);
        let tval = gen.deriveAbstract(
          value.types,
          value.values,
          [key.object, value],
          createOperationDescriptor("LOGICAL_PROPERTY_ASSIGNMENT", { propertyBinding: key, value }),
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
      let value = val.throwIfNotConcrete(this).value;
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

  returnOrThrowCompletion(completion: Completion | Value): Value {
    if (completion instanceof Value) completion = new SimpleNormalCompletion(completion);
    if (completion instanceof AbruptCompletion) {
      let c = Functions.incorporateSavedCompletion(this, completion);
      invariant(c instanceof Completion);
      completion = c;
    }
    let cc = this.composeWithSavedCompletion(completion);
    if (cc instanceof AbruptCompletion) throw cc;
    return cc.value;
  }

  composeWithSavedCompletion(completion: Completion): Completion {
    if (this.savedCompletion === undefined) {
      if (completion instanceof JoinedNormalAndAbruptCompletions) {
        this.savedCompletion = completion;
        this.pushPathConditionsLeadingToNormalCompletions(completion);
        this.captureEffects(completion);
      }
      return completion;
    } else {
      let cc = Join.composeCompletions(this.savedCompletion, completion);
      if (cc instanceof JoinedNormalAndAbruptCompletions) {
        this.savedCompletion = cc;
        this.pushPathConditionsLeadingToNormalCompletions(completion);
        if (cc.savedEffects === undefined) this.captureEffects(cc);
      } else {
        this.savedCompletion = undefined;
      }
      return cc;
    }
  }

  pushPathConditionsLeadingToNormalCompletions(completion: Completion): void {
    let realm = this;
    let bottomValue = realm.intrinsics.__bottomValue;
    // Note that if a completion of type CompletionType has a value is that is bottom, that completion is unreachable
    // and pushing its corresponding path condition would cause an InfeasiblePathError to be thrown.
    if (completion instanceof JoinedNormalAndAbruptCompletions && completion.composedWith !== undefined)
      this.pushPathConditionsLeadingToNormalCompletions(completion.composedWith);
    if (completion instanceof JoinedAbruptCompletions || completion instanceof JoinedNormalAndAbruptCompletions) {
      let jc = completion.joinCondition;
      if (completion.consequent.value === bottomValue || allPathsAreOfType(AbruptCompletion, completion.consequent)) {
        if (completion.alternate.value === bottomValue || allPathsAreOfType(AbruptCompletion, completion.alternate))
          return;
        Path.pushInverseAndRefine(completion.joinCondition);
        this.pushPathConditionsLeadingToNormalCompletions(completion.alternate);
      } else if (
        completion.alternate.value === bottomValue ||
        allPathsAreOfType(AbruptCompletion, completion.alternate)
      ) {
        if (completion.consequent.value === bottomValue) return;
        Path.pushAndRefine(completion.joinCondition);
        this.pushPathConditionsLeadingToNormalCompletions(completion.consequent);
      } else if (allPathsAreOfType(NormalCompletion, completion.consequent)) {
        if (!allPathsAreOfType(NormalCompletion, completion.alternate)) {
          let alternatePC = getNormalPathConditions(completion.alternate);
          let disjunct = AbstractValue.createFromLogicalOp(realm, "||", jc, alternatePC, undefined, true, true);
          Path.pushAndRefine(disjunct);
        }
      } else if (allPathsAreOfType(NormalCompletion, completion.alternate)) {
        let consequentPC = getNormalPathConditions(completion.consequent);
        let inverse = AbstractValue.createFromUnaryOp(realm, "!", jc, true, undefined, true, true);
        let disjunct = AbstractValue.createFromLogicalOp(realm, "||", inverse, consequentPC, undefined, true, true);
        Path.pushAndRefine(disjunct);
      } else {
        let cpc = AbstractValue.createFromLogicalOp(
          realm,
          "&&",
          jc,
          getNormalPathConditions(completion.consequent),
          undefined,
          true,
          true
        );
        let ijc = AbstractValue.createFromUnaryOp(realm, "!", jc, true, undefined, true, true);
        let apc = AbstractValue.createFromLogicalOp(
          realm,
          "&&",
          ijc,
          getNormalPathConditions(completion.alternate),
          undefined,
          true,
          true
        );
        let disjunct = AbstractValue.createFromLogicalOp(realm, "||", cpc, apc, undefined, true, true);
        Path.pushAndRefine(disjunct);
      }
    }
    return;

    function allPathsAreOfType(CompletionType: typeof Completion, c: Completion): boolean {
      if (c instanceof JoinedNormalAndAbruptCompletions) {
        if (c.composedWith !== undefined && !allPathsAreOfType(CompletionType, c.composedWith)) return false;
        return allPathsAreOfType(CompletionType, c.consequent) && allPathsAreOfType(CompletionType, c.alternate);
      } else if (c instanceof JoinedAbruptCompletions) {
        return allPathsAreOfType(CompletionType, c.consequent) && allPathsAreOfType(CompletionType, c.alternate);
      } else {
        return c instanceof CompletionType;
      }
    }

    function getNormalPathConditions(c: Completion): Value {
      let pathCondToComposeWith;
      if (c instanceof JoinedNormalAndAbruptCompletions && c.composedWith !== undefined)
        pathCondToComposeWith = getNormalPathConditions(c.composedWith);
      if (!(c instanceof JoinedAbruptCompletions || c instanceof JoinedNormalAndAbruptCompletions)) {
        return c instanceof AbruptCompletion ? realm.intrinsics.false : realm.intrinsics.true;
      }
      let pathCond;
      if (c.consequent.value === bottomValue || allPathsAreOfType(AbruptCompletion, c.consequent)) {
        if (!allPathsAreOfType(AbruptCompletion, c.alternate)) {
          let inverse = AbstractValue.createFromUnaryOp(realm, "!", c.joinCondition, true, undefined, true, true);
          if (allPathsAreOfType(NormalCompletion, c.alternate)) pathCond = inverse;
          else
            pathCond = AbstractValue.createFromLogicalOp(
              realm,
              "&&",
              inverse,
              getNormalPathConditions(c.alternate),
              undefined,
              true,
              true
            );
        }
      } else if (c.alternate.value === bottomValue || allPathsAreOfType(AbruptCompletion, c.alternate)) {
        if (!allPathsAreOfType(AbruptCompletion, c.consequent)) {
          if (allPathsAreOfType(NormalCompletion, c.consequent)) {
            pathCond = c.joinCondition;
          } else {
            let jc = c.joinCondition;
            pathCond = AbstractValue.createFromLogicalOp(
              realm,
              "&&",
              jc,
              getNormalPathConditions(c.consequent),
              undefined,
              true,
              true
            );
          }
        }
      } else {
        let jc = c.joinCondition;
        let consequentPC = AbstractValue.createFromLogicalOp(
          realm,
          "&&",
          jc,
          getNormalPathConditions(c.consequent),
          undefined,
          true,
          true
        );
        let ijc = AbstractValue.createFromUnaryOp(realm, "!", jc, true, undefined, true, true);
        let alternatePC = AbstractValue.createFromLogicalOp(
          realm,
          "&&",
          ijc,
          getNormalPathConditions(c.alternate),
          undefined,
          true,
          true
        );
        pathCond = AbstractValue.createFromLogicalOp(realm, "||", consequentPC, alternatePC, undefined, true, true);
      }
      if (pathCondToComposeWith === undefined && pathCond === undefined) return realm.intrinsics.false;
      if (pathCondToComposeWith === undefined) {
        invariant(pathCond !== undefined);
        return pathCond;
      }
      if (pathCond === undefined) return pathCondToComposeWith;
      return AbstractValue.createFromLogicalOp(realm, "&&", pathCondToComposeWith, pathCond, undefined, true, true);
    }
  }

  captureEffects(completion: JoinedNormalAndAbruptCompletions): void {
    invariant(completion.savedEffects === undefined);
    completion.savedEffects = new Effects(
      new SimpleNormalCompletion(this.intrinsics.undefined),
      (this.generator: any),
      (this.modifiedBindings: any),
      (this.modifiedProperties: any),
      (this.createdObjects: any),
      (this.createdAbstracts: any)
    );
    this.generator = new Generator(this, "captured", this.pathConditions);
    this.modifiedBindings = new Map();
    this.modifiedProperties = new Map();
    this.createdObjects = new Set();
    this.createdAbstracts = new Set();
  }

  getCapturedEffects(v?: Completion | Value = this.intrinsics.undefined): Effects {
    invariant(this.generator !== undefined);
    invariant(this.modifiedBindings !== undefined);
    invariant(this.modifiedProperties !== undefined);
    invariant(this.createdObjects !== undefined);
    invariant(this.createdAbstracts !== undefined);
    return new Effects(
      v instanceof Completion ? v : new SimpleNormalCompletion(v),
      this.generator,
      this.modifiedBindings,
      this.modifiedProperties,
      this.createdObjects,
      this.createdAbstracts
    );
  }

  stopEffectCaptureAndUndoEffects(completion: JoinedNormalAndAbruptCompletions): void {
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
      this.createdAbstracts = savedEffects.createdAbstracts;
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
    let { generator, modifiedBindings, modifiedProperties, createdObjects, createdAbstracts } = effects;

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

    // add created abstracts
    if (createdAbstracts.size > 0) {
      let realmCreatedAbstracts = this.createdAbstracts;
      if (realmCreatedAbstracts === undefined) this.createdAbstracts = new Set(createdAbstracts);
      else {
        createdAbstracts.forEach((ob, a) => {
          invariant(realmCreatedAbstracts !== undefined);
          realmCreatedAbstracts.add(ob);
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
    if (binding.environment.isReadOnly) {
      // This only happens during speculative execution and is reported elsewhere
      throw new FatalError("Trying to modify a binding in read-only realm");
    }

    if (this.modifiedBindings !== undefined && !this.modifiedBindings.has(binding)) {
      this.modifiedBindings.set(binding, {
        hasLeaked: binding.hasLeaked,
        value: binding.value,
      });
    }
    return binding;
  }

  callReportObjectGetOwnProperties(ob: ObjectValue | AbstractObjectValue): void {
    if (this.reportObjectGetOwnProperties !== undefined) {
      this.reportObjectGetOwnProperties(ob);
    }
  }

  callReportPropertyAccess(binding: PropertyBinding, isWrite: boolean): void {
    if (this.reportPropertyAccess !== undefined) {
      this.reportPropertyAccess(binding, isWrite);
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
    this.callReportPropertyAccess(binding, true);
    if (this.modifiedProperties !== undefined && !this.modifiedProperties.has(binding)) {
      let clone;
      let desc = binding.descriptor;
      if (desc === undefined) {
        clone = undefined;
      } else if (desc instanceof AbstractJoinedDescriptor) {
        clone = new AbstractJoinedDescriptor(desc.joinCondition, desc.descriptor1, desc.descriptor2);
      } else if (desc instanceof PropertyDescriptor) {
        clone = cloneDescriptor(desc);
      } else if (desc instanceof InternalSlotDescriptor) {
        clone = new InternalSlotDescriptor(desc.value);
      } else {
        invariant(false, "unknown descriptor");
      }
      this.modifiedProperties.set(binding, clone);
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

  recordNewAbstract(abstract: AbstractValue): void {
    if (this.createdAbstracts !== undefined) {
      this.createdAbstracts.add(abstract);
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
      m.set(binding, { hasLeaked: l, value: v });
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
      invariant(propertyValue.args.length >= 2);
      let absVal = propertyValue.args[0];
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
      let desc = binding.descriptor.throwIfNotConcrete(this);
      let value = desc.value;
      Properties.ThrowIfMightHaveBeenDeleted(desc);
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

  /* Since it makes strong assumptions, Instant Render is likely to have a large
  number of unsupported scenarios. We group all associated compiler diagnostics here. */
  instantRenderBailout(message: string, loc: ?BabelNodeSourceLocation) {
    if (loc === undefined) loc = this.currentLocation;
    let error = new CompilerDiagnostic(message, loc, "PP0039", "RecoverableError");
    if (this.handleError(error) === "Fail") throw new FatalError();
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

  evaluateWithIncreasedMaxStackDepth<T>(increaseRemainingCallsBy: number, f: () => T): T {
    invariant(increaseRemainingCallsBy > 0);
    this.remainingCalls += increaseRemainingCallsBy;
    try {
      return f();
    } finally {
      this.remainingCalls -= increaseRemainingCallsBy;
    }
  }

  // Pass the error to the realm's error-handler
  // Return value indicates whether the caller should try to recover from the error or not.
  handleError(diagnostic: CompilerDiagnostic): ErrorHandlerResult {
    if (!diagnostic.callStack && this.contextStack.length > 0) {
      let error = this.evaluateWithIncreasedMaxStackDepth(1, () =>
        this.evaluateWithoutEffects(() => Construct(this, this.intrinsics.Error).throwIfNotConcreteObject())
      );
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
      switch (diagnostic.severity) {
        case "Information":
          console.log(`Info: ${msg}`);
          console.log(diagnostic.callStack);
          return "Recover";
        case "Warning":
          console.warn(`Warn: ${msg}`);
          console.warn(diagnostic.callStack);
          return "Recover";
        case "RecoverableError":
          console.error(`Error: ${msg}`);
          console.error(diagnostic.callStack);
          return "Fail";
        case "FatalError":
          console.error(`Fatal Error: ${msg}`);
          console.error(diagnostic.callStack);
          return "Fail";
        default:
          invariant(false, "Unexpected error type");
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
