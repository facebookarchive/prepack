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
  AbstractObjectValue,
  AbstractValue,
  ArrayValue,
  BooleanValue,
  ConcreteValue,
  ECMAScriptFunctionValue,
  ECMAScriptSourceFunctionValue,
  EmptyValue,
  FunctionValue,
  NativeFunctionValue,
  NullValue,
  NumberValue,
  PrimitiveValue,
  StringValue,
  SymbolValue,
  UndefinedValue,
} from "./values/index.js";
import { Value } from "./values/index.js";
import {
  AbruptCompletion,
  Completion,
  JoinedAbruptCompletions,
  NormalCompletion,
  PossiblyNormalCompletion,
} from "./completions.js";
import { EnvironmentRecord, LexicalEnvironment, Reference } from "./environment.js";
import { Generator } from "./utils/generator.js";
import { ObjectValue } from "./values/index.js";
import type {
  BabelNode,
  BabelNodeBlockStatement,
  BabelNodeClassMethod,
  BabelNodeLVal,
  BabelNodeObjectMethod,
  BabelNodePattern,
  BabelNodeVariableDeclaration,
  BabelNodeSourceLocation,
} from "babel-types";
import type { Bindings, Effects, EvaluationResult, PropertyBindings, CreatedObjects, Realm } from "./realm.js";

export const ElementSize = {
  Float32: 4,
  Float64: 8,
  Int8: 1,
  Int16: 2,
  Int32: 4,
  Uint8: 1,
  Uint16: 2,
  Uint32: 4,
  Uint8Clamped: 1,
};

export type ConsoleMethodTypes =
  | "assert"
  | "clear"
  | "count"
  | "dir"
  | "dirxml"
  | "error"
  | "group"
  | "groupCollapsed"
  | "groupEnd"
  | "info"
  | "log"
  | "table"
  | "time"
  | "timeEnd"
  | "trace"
  | "warn";

export type IterationKind = "key+value" | "value" | "key";

export type SourceType = "module" | "script";

export type SourceFile = {
  filePath: string,
  fileContents: string,
  sourceMapContents?: string,
};

export type SourceMap = {
  sources: Array<string>,
  names: Array<string>,
  mappings: string,
  sourcesContent: Array<string>,
};

export type AbstractTime = "early" | "late";

export type ElementType =
  | "Float32"
  | "Float64"
  | "Int8"
  | "Int16"
  | "Int32"
  | "Uint8"
  | "Uint16"
  | "Uint32"
  | "Uint8Clamped";

//

declare class _CallableObjectValue extends ObjectValue {
  $Call: void | ((thisArgument: Value, argsList: Array<Value>) => Value);
}
export type CallableObjectValue = _CallableObjectValue | FunctionValue | NativeFunctionValue;

//

export type DataBlock = Uint8Array;

//

export type Descriptor = {
  writable?: boolean,
  enumerable?: boolean,
  configurable?: boolean,

  // If value.IsEmpty is true then this descriptor indicates that the
  // corresponding property has been deleted.
  // Only internal properties (those starting with $) will ever have array values.
  value?: Value | Array<any>,

  get?: UndefinedValue | CallableObjectValue | AbstractValue,
  set?: UndefinedValue | CallableObjectValue | AbstractValue,

  // Only used if the result of a join of two descriptors is not a data descriptor with identical attribute values.
  // When present, any update to the property must produce effects that are the join of updating both desriptors,
  // using joinCondition as the condition of the join.
  joinCondition?: AbstractValue,
  descriptor1?: Descriptor,
  descriptor2?: Descriptor,
};

export type FunctionBodyAstNode = {
  // Function body ast node will have uniqueOrderedTag after being interpreted.
  // This tag value is unique and sorted in ast DFS traversal ordering.
  uniqueOrderedTag?: number,
};

export type PropertyBinding = {
  descriptor?: Descriptor,
  object: ObjectValue | AbstractObjectValue,
  key: void | string | SymbolValue | AbstractValue, // where an abstract value must be of type String or Number or Symbol
  // contains a build node that produces a member expression that resolves to this property binding (location)
  pathNode?: AbstractValue,
  internalSlot?: boolean,
};

export type LexicalEnvironmentTypes = "global" | "module" | "script" | "function" | "block" | "catch" | "loop" | "with";

export type PropertyKeyValue = string | StringValue | SymbolValue;

export type Intrinsics = {
  undefined: UndefinedValue,
  empty: EmptyValue,
  null: NullValue,
  false: BooleanValue,
  true: BooleanValue,
  NaN: NumberValue,
  Infinity: NumberValue,
  negativeInfinity: NumberValue,
  zero: NumberValue,
  negativeZero: NumberValue,
  emptyString: StringValue,

  SymbolHasInstance: SymbolValue,
  SymbolIsConcatSpreadable: SymbolValue,
  SymbolSpecies: SymbolValue,
  SymbolReplace: SymbolValue,
  SymbolIterator: SymbolValue,
  SymbolSplit: SymbolValue,
  SymbolToPrimitive: SymbolValue,
  SymbolToStringTag: SymbolValue,
  SymbolMatch: SymbolValue,
  SymbolSearch: SymbolValue,
  SymbolUnscopables: SymbolValue,

  ObjectPrototype: ObjectValue,
  FunctionPrototype: NativeFunctionValue,
  ArrayPrototype: ObjectValue,
  RegExpPrototype: ObjectValue,
  DatePrototype: ObjectValue,
  Boolean: NativeFunctionValue,
  BooleanPrototype: ObjectValue,

  Error: NativeFunctionValue,
  ErrorPrototype: ObjectValue,
  ReferenceError: NativeFunctionValue,
  ReferenceErrorPrototype: ObjectValue,
  SyntaxError: NativeFunctionValue,
  SyntaxErrorPrototype: ObjectValue,
  TypeError: NativeFunctionValue,
  TypeErrorPrototype: ObjectValue,
  URIError: NativeFunctionValue,
  URIErrorPrototype: ObjectValue,
  EvalError: NativeFunctionValue,
  EvalErrorPrototype: ObjectValue,
  JSON: ObjectValue,
  Reflect: ObjectValue,
  Proxy: NativeFunctionValue,
  RangeError: NativeFunctionValue,
  RangeErrorPrototype: ObjectValue,
  ArrayIteratorPrototype: ObjectValue,
  StringIteratorPrototype: ObjectValue,
  IteratorPrototype: ObjectValue,
  SetIteratorPrototype: ObjectValue,
  MapIteratorPrototype: ObjectValue,
  Number: NativeFunctionValue,
  NumberPrototype: ObjectValue,
  Symbol: NativeFunctionValue,
  SymbolPrototype: ObjectValue,
  StringPrototype: ObjectValue,
  Object: NativeFunctionValue,
  Function: NativeFunctionValue,
  Array: NativeFunctionValue,
  RegExp: NativeFunctionValue,
  Date: NativeFunctionValue,
  String: NativeFunctionValue,
  Math: ObjectValue,
  isNaN: NativeFunctionValue,
  parseInt: NativeFunctionValue,
  parseFloat: NativeFunctionValue,
  isFinite: NativeFunctionValue,
  decodeURI: NativeFunctionValue,
  decodeURIComponent: NativeFunctionValue,
  encodeURI: NativeFunctionValue,
  encodeURIComponent: NativeFunctionValue,
  ThrowTypeError: NativeFunctionValue,
  ArrayProto_values: NativeFunctionValue,
  ArrayProto_toString: NativeFunctionValue,
  ObjectProto_toString: NativeFunctionValue,
  TypedArrayProto_values: NativeFunctionValue,
  eval: NativeFunctionValue,
  console: ObjectValue,
  document: ObjectValue,
  process: ObjectValue,

  DataView: NativeFunctionValue,
  DataViewPrototype: ObjectValue,
  TypedArray: NativeFunctionValue,
  TypedArrayPrototype: ObjectValue,
  Float32Array: NativeFunctionValue,
  Float32ArrayPrototype: ObjectValue,
  Float64Array: NativeFunctionValue,
  Float64ArrayPrototype: ObjectValue,
  Int8Array: NativeFunctionValue,
  Int8ArrayPrototype: ObjectValue,
  Int16Array: NativeFunctionValue,
  Int16ArrayPrototype: ObjectValue,
  Int32Array: NativeFunctionValue,
  Int32ArrayPrototype: ObjectValue,
  Map: NativeFunctionValue,
  MapPrototype: ObjectValue,
  WeakMap: NativeFunctionValue,
  WeakMapPrototype: ObjectValue,
  Set: NativeFunctionValue,
  SetPrototype: ObjectValue,
  Promise: NativeFunctionValue,
  PromisePrototype: ObjectValue,
  Uint8Array: NativeFunctionValue,
  Uint8ArrayPrototype: ObjectValue,
  Uint8ClampedArray: NativeFunctionValue,
  Uint8ClampedArrayPrototype: ObjectValue,
  Uint16Array: NativeFunctionValue,
  Uint16ArrayPrototype: ObjectValue,
  Uint32Array: NativeFunctionValue,
  Uint32ArrayPrototype: ObjectValue,
  WeakSet: NativeFunctionValue,
  WeakSetPrototype: ObjectValue,
  ArrayBuffer: NativeFunctionValue,
  ArrayBufferPrototype: ObjectValue,

  Generator: ObjectValue,
  GeneratorPrototype: ObjectValue,
  GeneratorFunction: NativeFunctionValue,

  __IntrospectionError: NativeFunctionValue,
  __IntrospectionErrorPrototype: ObjectValue,
};

export type PromiseCapability = {
  promise: ObjectValue | UndefinedValue,
  resolve: Value,
  reject: Value,
};

export type PromiseReaction = {
  capabilities: PromiseCapability,
  handler: Value,
};

export type ResolvingFunctions = {
  resolve: Value,
  reject: Value,
};

export type TypedArrayKind =
  | "Float32Array"
  | "Float64Array"
  | "Int8Array"
  | "Int16Array"
  | "Int32Array"
  | "Uint8Array"
  | "Uint16Array"
  | "Uint32Array"
  | "Uint8ClampedArray";

export type ObjectKind =
  | "Object"
  | "Array"
  | "Function"
  | "Symbol"
  | "String"
  | "Number"
  | "Boolean"
  | "Date"
  | "RegExp"
  | "Set"
  | "Map"
  | "DataView"
  | "ArrayBuffer"
  | "WeakMap"
  | "WeakSet"
  | TypedArrayKind
  | "ReactElement";
// TODO #26 #712: Promises. All kinds of iterators. Generators.

export type ClassComponentMetadata = {
  instanceProperties: Set<string>,
  instanceSymbols: Set<SymbolValue>,
};

export type ReactHint = {| firstRenderValue: Value, object: ObjectValue, propertyName: string, args: Array<Value> |};

export type ReactComponentTreeConfig = {
  firstRenderOnly: boolean,
};

export type DebugServerType = {
  checkForActions: BabelNode => void,
  shutdown: () => void,
};

export type PathType = {
  implies(condition: Value): boolean,
  impliesNot(condition: Value): boolean,
  withCondition<T>(condition: Value, evaluate: () => T): T,
  withInverseCondition<T>(condition: Value, evaluate: () => T): T,
  pushAndRefine(condition: Value): void,
  pushInverseAndRefine(condition: Value): void,
};

export type HavocType = {
  value(realm: Realm, value: Value, loc: ?BabelNodeSourceLocation): void,
};

export type PropertiesType = {
  // ECMA262 9.1.9.1
  OrdinarySet(realm: Realm, O: ObjectValue, P: PropertyKeyValue, V: Value, Receiver: Value): boolean,

  // ECMA262 6.2.4.4
  FromPropertyDescriptor(realm: Realm, Desc: ?Descriptor): Value,

  //
  OrdinaryDelete(realm: Realm, O: ObjectValue, P: PropertyKeyValue): boolean,

  // ECMA262 7.3.8
  DeletePropertyOrThrow(realm: Realm, O: ObjectValue, P: PropertyKeyValue): boolean,

  // ECMA262 6.2.4.6
  CompletePropertyDescriptor(realm: Realm, Desc: Descriptor): Descriptor,

  // ECMA262 9.1.6.2
  IsCompatiblePropertyDescriptor(realm: Realm, extensible: boolean, Desc: Descriptor, current: ?Descriptor): boolean,

  // ECMA262 9.1.6.3
  ValidateAndApplyPropertyDescriptor(
    realm: Realm,
    O: void | ObjectValue,
    P: void | PropertyKeyValue,
    extensible: boolean,
    Desc: Descriptor,
    current: ?Descriptor
  ): boolean,

  // ECMA262 9.1.6.1
  OrdinaryDefineOwnProperty(realm: Realm, O: ObjectValue, P: PropertyKeyValue, Desc: Descriptor): boolean,

  // ECMA262 19.1.2.3.1
  ObjectDefineProperties(realm: Realm, O: Value, Properties: Value): ObjectValue | AbstractObjectValue,

  // ECMA262 7.3.3
  Set(realm: Realm, O: ObjectValue | AbstractObjectValue, P: PropertyKeyValue, V: Value, Throw: boolean): boolean,

  // ECMA262 7.3.7
  DefinePropertyOrThrow(
    realm: Realm,
    O: ObjectValue | AbstractObjectValue,
    P: PropertyKeyValue,
    desc: Descriptor
  ): boolean,

  // ECMA262 6.2.3.2
  PutValue(realm: Realm, V: Value | Reference, W: Value): void | boolean | Value,

  // ECMA262 9.4.2.4
  ArraySetLength(realm: Realm, A: ArrayValue, Desc: Descriptor): boolean,

  // ECMA262 9.1.5.1
  OrdinaryGetOwnProperty(realm: Realm, O: ObjectValue, P: PropertyKeyValue): Descriptor | void,

  // ECMA262 9.1.2.1
  OrdinarySetPrototypeOf(realm: Realm, O: ObjectValue, V: ObjectValue | NullValue): boolean,

  // ECMA262 13.7.5.15
  EnumerateObjectProperties(realm: Realm, O: ObjectValue): ObjectValue,

  ThrowIfMightHaveBeenDeleted(
    value: void | Value | Array<Value> | Array<{ $Key: void | Value, $Value: void | Value }>
  ): void,

  ThrowIfInternalSlotNotWritable<T: ObjectValue>(realm: Realm, object: T, key: string): T,

  // ECMA 14.3.9
  PropertyDefinitionEvaluation(
    realm: Realm,
    MethodDefinition: BabelNodeObjectMethod | BabelNodeClassMethod,
    object: ObjectValue,
    env: LexicalEnvironment,
    strictCode: boolean,
    enumerable: boolean
  ): boolean,
};

export type FunctionType = {
  FindVarScopedDeclarations(ast_node: BabelNode): Array<BabelNode>,

  // ECMA262 9.2.12
  FunctionDeclarationInstantiation(
    realm: Realm,
    func: ECMAScriptSourceFunctionValue,
    argumentsList: Array<Value>
  ): EmptyValue,

  // ECMA262 9.2.11
  SetFunctionName(realm: Realm, F: ObjectValue, name: PropertyKeyValue | AbstractValue, prefix?: string): boolean,

  // ECMA262 9.2.3
  FunctionInitialize(
    realm: Realm,
    F: ECMAScriptSourceFunctionValue,
    kind: "normal" | "method" | "arrow",
    ParameterList: Array<BabelNodeLVal>,
    Body: BabelNodeBlockStatement,
    Scope: LexicalEnvironment
  ): ECMAScriptSourceFunctionValue,

  // ECMA262 9.2.6
  GeneratorFunctionCreate(
    realm: Realm,
    kind: "normal" | "method",
    ParameterList: Array<BabelNodeLVal>,
    Body: BabelNodeBlockStatement,
    Scope: LexicalEnvironment,
    Strict: boolean
  ): ECMAScriptSourceFunctionValue,

  // ECMA262 9.2.7
  AddRestrictedFunctionProperties(F: FunctionValue, realm: Realm): boolean,

  // ECMA262 9.2.1
  $Call(realm: Realm, F: ECMAScriptFunctionValue, thisArgument: Value, argsList: Array<Value>): Value,

  // ECMA262 9.2.2
  $Construct(
    realm: Realm,
    F: ECMAScriptFunctionValue,
    argumentsList: Array<Value>,
    newTarget: ObjectValue
  ): ObjectValue,

  // ECMA262 9.2.3
  FunctionAllocate(
    realm: Realm,
    functionPrototype: ObjectValue | AbstractObjectValue,
    strict: boolean,
    functionKind: "normal" | "non-constructor" | "generator"
  ): ECMAScriptSourceFunctionValue,

  // ECMA262 9.4.1.3
  BoundFunctionCreate(
    realm: Realm,
    targetFunction: ObjectValue,
    boundThis: Value,
    boundArgs: Array<Value>
  ): ObjectValue,

  // ECMA262 18.2.1.1
  PerformEval(realm: Realm, x: Value, evalRealm: Realm, strictCaller: boolean, direct: boolean): Value,

  // If c is an abrupt completion and realm.savedCompletion is defined, the result is an instance of
  // JoinedAbruptCompletions and the effects that have been captured since the PossiblyNormalCompletion instance
  // in realm.savedCompletion has been created, becomes the effects of the branch that terminates in c.
  // If c is a normal completion, the result is realm.savedCompletion, with its value updated to c.
  // If c is undefined, the result is just realm.savedCompletion.
  // Call this only when a join point has been reached.
  incorporateSavedCompletion(realm: Realm, c: void | AbruptCompletion | Value): void | Completion | Value,

  EvaluateStatements(
    body: Array<BabelNodeStatement>,
    initialBlockValue: void | Value,
    strictCode: boolean,
    blockEnv: LexicalEnvironment,
    realm: Realm
  ): Value,

  PartiallyEvaluateStatements(
    body: Array<BabelNodeStatement>,
    blockValue: void | NormalCompletion | Value,
    strictCode: boolean,
    blockEnv: LexicalEnvironment,
    realm: Realm
  ): [Completion | Value, Array<BabelNodeStatement>],

  // ECMA262 9.2.5
  FunctionCreate(
    realm: Realm,
    kind: "normal" | "arrow" | "method",
    ParameterList: Array<BabelNodeLVal>,
    Body: BabelNodeBlockStatement,
    Scope: LexicalEnvironment,
    Strict: boolean,
    prototype?: ObjectValue
  ): ECMAScriptSourceFunctionValue,

  // ECMA262 18.2.1.2
  EvalDeclarationInstantiation(
    realm: Realm,
    body: BabelNodeBlockStatement,
    varEnv: LexicalEnvironment,
    lexEnv: LexicalEnvironment,
    strict: boolean
  ): Value,

  // ECMA 9.2.10
  MakeMethod(realm: Realm, F: ECMAScriptSourceFunctionValue, homeObject: ObjectValue): Value,

  // ECMA 14.3.8
  DefineMethod(
    realm: Realm,
    prop: BabelNodeObjectMethod | BabelNodeClassMethod,
    obj: ObjectValue,
    env: LexicalEnvironment,
    strictCode: boolean,
    functionPrototype?: ObjectValue
  ): { $Key: PropertyKeyValue, $Closure: ECMAScriptSourceFunctionValue },
};

export type EnvironmentType = {
  // ECMA262 6.2.3
  // IsSuperReference(V). Returns true if this reference has a thisValue component.
  IsSuperReference(realm: Realm, V: Reference): boolean,

  // ECMA262 6.2.3
  // HasPrimitiveBase(V). Returns true if Type(base) is Boolean, String, Symbol, or Number.
  HasPrimitiveBase(realm: Realm, V: Reference): boolean,

  // ECMA262 6.2.3
  // GetReferencedName(V). Returns the referenced name component of the reference V.
  GetReferencedName(realm: Realm, V: Reference): string | SymbolValue,

  GetReferencedNamePartial(realm: Realm, V: Reference): AbstractValue | string | SymbolValue,

  // ECMA262 6.2.3.1
  GetValue(realm: Realm, V: Reference | Value): Value,
  GetConditionValue(realm: Realm, V: Reference | Value): Value,

  // ECMA262 6.2.3
  // IsStrictReference(V). Returns the strict reference flag component of the reference V.
  IsStrictReference(realm: Realm, V: Reference): boolean,

  // ECMA262 6.2.3
  // IsPropertyReference(V). Returns true if either the base value is an object or HasPrimitiveBase(V) is true; otherwise returns false.
  IsPropertyReference(realm: Realm, V: Reference): boolean,

  // ECMA262 6.2.3
  // GetBase(V). Returns the base value component of the reference V.
  GetBase(realm: Realm, V: Reference): void | Value | EnvironmentRecord,

  // ECMA262 6.2.3
  // IsUnresolvableReference(V). Returns true if the base value is undefined and false otherwise.
  IsUnresolvableReference(realm: Realm, V: Reference): boolean,

  // ECMA262 8.1.2.2
  NewDeclarativeEnvironment(realm: Realm, E: LexicalEnvironment, active?: boolean): LexicalEnvironment,

  BoundNames(realm: Realm, node: BabelNode): Array<string>,

  // ECMA262 13.3.3.2
  ContainsExpression(realm: Realm, node: ?BabelNode): boolean,

  // ECMA262 8.3.2
  ResolveBinding(realm: Realm, name: string, strict: boolean, env?: ?LexicalEnvironment): Reference,

  // ECMA262 8.1.2.1
  GetIdentifierReference(realm: Realm, lex: ?LexicalEnvironment, name: string, strict: boolean): Reference,

  // ECMA262 6.2.3.4
  InitializeReferencedBinding(realm: Realm, V: Reference, W: Value): Value,

  // ECMA262 13.2.14
  BlockDeclarationInstantiation(
    realm: Realm,
    strictCode: boolean,
    body: Array<BabelNodeStatement>,
    env: LexicalEnvironment
  ): void,

  // ECMA262 8.1.2.5
  NewGlobalEnvironment(
    realm: Realm,
    G: ObjectValue | AbstractObjectValue,
    thisValue: ObjectValue | AbstractObjectValue
  ): void,

  // ECMA262 8.1.2.3
  NewObjectEnvironment(realm: Realm, O: ObjectValue | AbstractObjectValue, E: LexicalEnvironment): LexicalEnvironment,

  // ECMA262 8.1.2.4
  NewFunctionEnvironment(realm: Realm, F: ECMAScriptFunctionValue, newTarget?: ObjectValue): LexicalEnvironment,

  // ECMA262 8.3.1
  GetActiveScriptOrModule(realm: Realm): any,

  // ECMA262 8.3.3
  GetThisEnvironment(realm: Realm): EnvironmentRecord,

  // ECMA262 8.3.4
  ResolveThisBinding(realm: Realm): NullValue | ObjectValue | AbstractObjectValue | UndefinedValue,

  BindingInitialization(
    realm: Realm,
    node: BabelNodeLVal | BabelNodeVariableDeclaration,
    value: Value,
    strictCode: boolean,
    environment: void | LexicalEnvironment
  ): void | boolean | Value,

  // ECMA262 13.3.3.6
  // ECMA262 14.1.19
  IteratorBindingInitialization(
    realm: Realm,
    formals: $ReadOnlyArray<BabelNodeLVal | null>,
    iteratorRecord: { $Iterator: ObjectValue, $Done: boolean },
    strictCode: boolean,
    environment: void | LexicalEnvironment
  ): void,

  // ECMA262 12.1.5.1
  InitializeBoundName(
    realm: Realm,
    name: string,
    value: Value,
    environment: void | LexicalEnvironment
  ): void | boolean | Value,

  // ECMA262 12.3.1.3 and 13.7.5.6
  IsDestructuring(ast: BabelNode): boolean,

  // ECMA262 13.3.3.7
  KeyedBindingInitialization(
    realm: Realm,
    node: BabelNodeIdentifier | BabelNodePattern,
    value: Value,
    strictCode: boolean,
    environment: ?LexicalEnvironment,
    propertyName: PropertyKeyValue
  ): void | boolean | Value,
};

export type JoinType = {
  stopEffectCaptureJoinApplyAndReturnCompletion(
    c1: PossiblyNormalCompletion,
    c2: AbruptCompletion,
    realm: Realm
  ): AbruptCompletion,

  unbundleNormalCompletion(
    completionOrValue: Completion | Value | Reference
  ): [void | NormalCompletion, Value | Reference],

  composeNormalCompletions(
    leftCompletion: void | NormalCompletion,
    rightCompletion: void | NormalCompletion,
    resultValue: Value,
    realm: Realm
  ): PossiblyNormalCompletion | Value,

  composePossiblyNormalCompletions(
    realm: Realm,
    pnc: PossiblyNormalCompletion,
    c: PossiblyNormalCompletion,
    priorEffects?: Effects
  ): PossiblyNormalCompletion,

  updatePossiblyNormalCompletionWithSubsequentEffects(
    realm: Realm,
    pnc: PossiblyNormalCompletion,
    subsequentEffects: Effects
  ): void,

  updatePossiblyNormalCompletionWithValue(realm: Realm, pnc: PossiblyNormalCompletion, v: Value): void,

  // Returns the joined effects of all of the paths in pnc.
  // The normal path in pnc is modified to become terminated by ac,
  // so the overall completion will always be an instance of JoinedAbruptCompletions
  joinPossiblyNormalCompletionWithAbruptCompletion(
    realm: Realm,
    // a forked path with a non abrupt (normal) component
    pnc: PossiblyNormalCompletion,
    // an abrupt completion that completes the normal path
    ac: AbruptCompletion,
    // effects collected after pnc was constructed
    e: Effects
  ): Effects,

  joinPossiblyNormalCompletionWithValue(
    realm: Realm,
    joinCondition: AbstractValue,
    pnc: PossiblyNormalCompletion,
    v: Value
  ): void,

  joinValueWithPossiblyNormalCompletion(
    realm: Realm,
    joinCondition: AbstractValue,
    pnc: PossiblyNormalCompletion,
    v: Value
  ): void,

  extractAndJoinCompletionsOfType(
    CompletionType: typeof AbruptCompletion,
    realm: Realm,
    c: AbruptCompletion,
    convertToPNC?: boolean
  ): Effects,

  joinEffectsAndPromoteNested(
    CompletionType: typeof Completion,
    realm: Realm,
    c: Completion | Value,
    e: Effects,
    nested_effects?: Effects
  ): Effects,

  unbundle(
    CompletionType: typeof Completion,
    realm: Realm,
    c: JoinedAbruptCompletions
  ): [Effects, PossiblyNormalCompletion],

  removeNormalEffects(realm: Realm, c: PossiblyNormalCompletion): Effects,

  joinEffects(realm: Realm, joinCondition: Value, e1: Effects, e2: Effects): Effects,

  joinNestedEffects(realm: Realm, c: Completion, precedingEffects?: Effects): Effects,

  joinResults(
    realm: Realm,
    joinCondition: AbstractValue,
    result1: EvaluationResult,
    result2: EvaluationResult,
    e1: Effects,
    e2: Effects
  ): AbruptCompletion | PossiblyNormalCompletion | Value,

  composeGenerators(realm: Realm, generator1: Generator, generator2: Generator): Generator,

  // Creates a single map that joins together maps m1 and m2 using the given join
  // operator. If an entry is present in one map but not the other, the missing
  // entry is treated as if it were there and its value were undefined.
  joinMaps<K, V>(m1: Map<K, V>, m2: Map<K, V>, join: (K, void | V, void | V) => V): Map<K, V>,

  // Creates a single map that has an key, value pair for the union of the key
  // sets of m1 and m2. The value of a pair is the join of m1[key] and m2[key]
  // where the join is defined to be just m1[key] if m1[key] === m2[key] and
  // and abstract value with expression "joinCondition ? m1[key] : m2[key]" if not.
  joinBindings(realm: Realm, joinCondition: AbstractValue, m1: Bindings, m2: Bindings): Bindings,

  // If v1 is known and defined and v1 === v2 return v1,
  // otherwise return getAbstractValue(v1, v2)
  joinValues(
    realm: Realm,
    v1: void | Value | Array<Value> | Array<{ $Key: void | Value, $Value: void | Value }>,
    v2: void | Value | Array<Value> | Array<{ $Key: void | Value, $Value: void | Value }>,
    getAbstractValue: (void | Value, void | Value) => Value
  ): Value | Array<Value> | Array<{ $Key: void | Value, $Value: void | Value }>,

  joinValuesAsConditional(realm: Realm, condition: Value, v1: void | Value, v2: void | Value): Value,

  joinPropertyBindings(
    realm: Realm,
    joinCondition: AbstractValue,
    m1: PropertyBindings,
    m2: PropertyBindings,
    c1: CreatedObjects,
    c2: CreatedObjects
  ): PropertyBindings,

  // Returns a field by field join of two descriptors.
  // Descriptors with get/set are not yet supported.
  joinDescriptors(
    realm: Realm,
    joinCondition: AbstractValue,
    d1: void | Descriptor,
    d2: void | Descriptor
  ): void | Descriptor,
};

export type CreateType = {
  // ECMA262 9.4.3.3
  StringCreate(realm: Realm, value: StringValue, prototype: ObjectValue | AbstractObjectValue): ObjectValue,

  // B.2.3.2.1
  CreateHTML(realm: Realm, string: Value, tag: string, attribute: string, value: string | Value): StringValue,

  // ECMA262 9.4.4.8.1
  MakeArgGetter(realm: Realm, name: string, env: EnvironmentRecord): NativeFunctionValue,

  // ECMA262 9.4.4.8.1
  MakeArgSetter(realm: Realm, name: string, env: EnvironmentRecord): NativeFunctionValue,

  // ECMA262 21.1.5.1
  CreateStringIterator(realm: Realm, string: StringValue): ObjectValue,

  // ECMA262 9.4.2.3
  ArraySpeciesCreate(realm: Realm, originalArray: ObjectValue, length: number): ObjectValue,

  // ECMA262 7.4.7
  CreateIterResultObject(realm: Realm, value: Value, done: boolean): ObjectValue,

  // ECMA262 22.1.5.1
  CreateArrayIterator(realm: Realm, array: ObjectValue, kind: IterationKind): ObjectValue,

  // ECMA262 9.4.2.2
  ArrayCreate(realm: Realm, length: number, proto?: ObjectValue | AbstractObjectValue): ArrayValue,

  // ECMA262 7.3.16
  CreateArrayFromList(realm: Realm, elems: Array<Value>): ArrayValue,

  // ECMA262 9.4.4.7
  CreateUnmappedArgumentsObject(realm: Realm, argumentsList: Array<Value>): ObjectValue,

  // ECMA262 9.4.4.8
  CreateMappedArgumentsObject(
    realm: Realm,
    func: FunctionValue,
    formals: Array<BabelNodeLVal>,
    argumentsList: Array<Value>,
    env: EnvironmentRecord
  ): ObjectValue,

  // ECMA262 7.3.23 (sec-copydataproperties)
  CopyDataProperties(realm: Realm, target: ObjectValue, source: Value, excluded: Array<StringValue>): ObjectValue,

  // ECMA262 7.3.4
  CreateDataProperty(realm: Realm, O: ObjectValue, P: PropertyKeyValue, V: Value): boolean,

  // ECMA262 7.3.5
  CreateMethodProperty(realm: Realm, O: ObjectValue, P: PropertyKeyValue, V: Value): boolean,

  // ECMA262 7.3.6
  CreateDataPropertyOrThrow(realm: Realm, O: Value, P: PropertyKeyValue, V: Value): boolean,

  // ECMA262 9.1.12
  ObjectCreate(
    realm: Realm,
    proto: ObjectValue | AbstractObjectValue | NullValue,
    internalSlotsList?: { [key: string]: void }
  ): ObjectValue,

  // ECMA262 9.1.13
  OrdinaryCreateFromConstructor(
    realm: Realm,
    constructor: ObjectValue,
    intrinsicDefaultProto: string,
    internalSlotsList?: { [key: string]: void }
  ): ObjectValue,

  // ECMA262 7.3.17
  CreateListFromArrayLike(realm: Realm, obj: Value, elementTypes?: Array<string>): Array<Value>,

  // ECMA262 19.2.1.1.1
  CreateDynamicFunction(
    realm: Realm,
    constructor: ObjectValue,
    newTarget: void | ObjectValue,
    kind: "normal" | "generator",
    args: Array<Value>
  ): Value,
};

export type WidenType = {
  // Returns a new effects summary that includes both e1 and e2.
  widenEffects(realm: Realm, e1: Effects, e2: Effects): Effects,

  // Returns an abstract value that includes both v1 and v2 as potential values.
  widenValues(
    realm: Realm,
    v1: Value | Array<Value> | Array<{ $Key: void | Value, $Value: void | Value }>,
    v2: Value | Array<Value> | Array<{ $Key: void | Value, $Value: void | Value }>
  ): Value | Array<Value> | Array<{ $Key: void | Value, $Value: void | Value }>,

  containsArraysOfValue(realm: Realm, a1: void | Array<Value>, a2: void | Array<Value>): boolean,

  // If e2 is the result of a loop iteration starting with effects e1 and it has a subset of elements of e1,
  // then we have reached a fixed point and no further calls to widen are needed. e1/e2 represent a general
  // summary of the loop, regardless of how many iterations will be performed at runtime.
  containsEffects(e1: Effects, e2: Effects): boolean,
};

export type numberOrValue = number | Value;

export type ElementConvType = {
  Int8: (Realm, numberOrValue) => number,
  Int16: (Realm, numberOrValue) => number,
  Int32: (Realm, numberOrValue) => number,
  Uint8: (Realm, numberOrValue) => number,
  Uint16: (Realm, numberOrValue) => number,
  Uint32: (Realm, numberOrValue) => number,
  Uint8Clamped: (Realm, numberOrValue) => number,
};

export type ToType = {
  ElementConv: ElementConvType,

  // ECMA262 7.1.5
  ToInt32(realm: Realm, argument: numberOrValue): number,

  // ECMA262 7.1.6
  ToUint32(realm: Realm, argument: numberOrValue): number,

  // ECMA262 7.1.7
  ToInt16(realm: Realm, argument: numberOrValue): number,

  // ECMA262 7.1.8
  ToUint16(realm: Realm, argument: numberOrValue): number,

  // ECMA262 7.1.9
  ToInt8(realm: Realm, argument: numberOrValue): number,

  // ECMA262 7.1.10
  ToUint8(realm: Realm, argument: numberOrValue): number,

  // ECMA262 7.1.11
  ToUint8Clamp(realm: Realm, argument: numberOrValue): number,

  // ECMA262 19.3.3.1
  thisBooleanValue(realm: Realm, value: Value): BooleanValue,

  // ECMA262 20.1.3
  thisNumberValue(realm: Realm, value: Value): NumberValue,

  // ECMA262 21.1.3
  thisStringValue(realm: Realm, value: Value): StringValue,

  // ECMA262 6.2.4.5
  ToPropertyDescriptor(realm: Realm, Obj: Value): Descriptor,

  // ECMA262 7.1.13
  ToObject(realm: Realm, arg: Value): ObjectValue | AbstractObjectValue,

  // ECMA262 7.1.15
  ToLength(realm: Realm, argument: numberOrValue): number,

  // ECMA262 7.1.4
  ToInteger(realm: Realm, argument: numberOrValue): number,

  // ECMA262 7.1.17
  ToIndex(realm: Realm, value: number | ConcreteValue): number,

  ToIndexPartial(realm: Realm, value: numberOrValue): number,

  // ECMA262 7.1.3
  ToNumber(realm: Realm, val: numberOrValue): number,

  ToNumberOrAbstract(realm: Realm, val: numberOrValue): number | AbstractValue,

  IsToNumberPure(realm: Realm, val: numberOrValue): boolean,

  // ECMA262 7.1.1
  ToPrimitive(realm: Realm, input: ConcreteValue, hint?: "default" | "string" | "number"): PrimitiveValue,

  ToPrimitiveOrAbstract(
    realm: Realm,
    input: ConcreteValue,
    hint?: "default" | "string" | "number"
  ): AbstractValue | PrimitiveValue,

  // Returns result type of ToPrimitive if it is pure (terminates, does not throw exception, does not read or write heap), otherwise undefined.
  GetToPrimitivePureResultType(realm: Realm, input: Value): void | typeof Value,

  IsToPrimitivePure(realm: Realm, input: Value): boolean,

  // ECMA262 7.1.1
  OrdinaryToPrimitive(realm: Realm, input: ObjectValue, hint: "string" | "number"): PrimitiveValue,

  OrdinaryToPrimitiveOrAbstract(
    realm: Realm,
    input: ObjectValue,
    hint: "string" | "number"
  ): AbstractValue | PrimitiveValue,

  // ECMA262 7.1.12
  ToString(realm: Realm, val: string | ConcreteValue): string,

  ToStringPartial(realm: Realm, val: string | Value): string,

  ToStringValue(realm: Realm, val: Value): Value,

  ToStringAbstract(realm: Realm, val: AbstractValue): AbstractValue,

  // ECMA262 7.1.2
  ToBoolean(realm: Realm, val: ConcreteValue): boolean,

  ToBooleanPartial(realm: Realm, val: Value): boolean,

  // ECMA262 7.1.14
  ToPropertyKey(realm: Realm, arg: ConcreteValue): SymbolValue | string /* but not StringValue */,

  ToPropertyKeyPartial(realm: Realm, arg: Value): AbstractValue | SymbolValue | string /* but not StringValue */,

  // ECMA262 7.1.16
  CanonicalNumericIndexString(realm: Realm, argument: StringValue): number | void,
};

export type ConcretizeType = (realm: Realm, val: Value) => ConcreteValue;

export type UtilsType = {|
  typeToString: (typeof Value) => void | string,
  getTypeFromName: string => void | typeof Value,
  describeValue: Value => string,
|};
