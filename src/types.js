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
  EmptyValue,
  FunctionValue,
  NativeFunctionValue,
  NullValue,
  NumberValue,
  StringValue,
  SymbolValue,
  UndefinedValue,
  Value,
} from "./values/index.js";
import { LexicalEnvironment, Reference } from "./environment.js";
import { ObjectValue } from "./values/index.js";
import type { BabelNode, BabelNodeClassMethod, BabelNodeObjectMethod } from "babel-types";
import { Realm } from "./realm.js";

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
  $Call: void | ((thisArgument: Value, argsList: Array<Value>) => Value),
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
};

export type FunctionBodyAstNode = {
  // Function body ast node will have uniqueTag after interpreted.
  uniqueTag?: number,
};

export type PropertyBinding = {
  descriptor?: Descriptor,
  object: ObjectValue | AbstractObjectValue,
  key: any,
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

export type DebugServerType = {
  checkForActions: BabelNode => void,
  shutdown: () => void,
};

export type PathType = {
  implies(condition: AbstractValue): boolean,
  withCondition<T>(condition: AbstractValue, evaluate: () => T): T,
  withInverseCondition<T>(condition: AbstractValue, evaluate: () => T): T,
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
