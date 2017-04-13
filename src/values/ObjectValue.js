/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { Realm, ExecutionContext } from "../realm.js";
import type { IterationKind, PromiseCapability, PromiseReaction, DataBlock, PropertyKeyValue, PropertyBinding, Descriptor } from "../types.js";
import { Value, AbstractValue, ConcreteValue, BooleanValue, StringValue, SymbolValue, NumberValue, UndefinedValue, NullValue, NativeFunctionValue } from "./index.js";
import type { NativeFunctionCallback } from "./index.js";
import { OrdinarySetPrototypeOf, OrdinaryDefineOwnProperty, OrdinaryDelete, OrdinaryOwnPropertyKeys, OrdinaryGetOwnProperty, OrdinaryGet, OrdinaryHasProperty, OrdinarySet, OrdinaryIsExtensible, OrdinaryPreventExtensions, ThrowIfMightHaveBeenDeleted } from "../methods/index.js";

import invariant from "../invariant.js";

export default class ObjectValue extends ConcreteValue {
  constructor(realm: Realm, proto?: ObjectValue | NullValue, intrinsicName?: string) {
    super(realm, intrinsicName);
    realm.recordNewObject(this);
    if (realm.isPartial) this.setupBindings();
    this.$Prototype = proto || (realm.intrinsics && realm.intrinsics.null);
    this.$Extensible = realm.intrinsics.true;
    this._isPartial = realm.intrinsics.false;
    this._isSimple = realm.intrinsics.false;
    this.properties = new Map();
    this.symbols = new Map();
  }

  static trackedProperties = ["$Prototype", "$Extensible", "$SetNextIndex", "$IteratedSet",
   "$MapNextIndex", "$MapData", "$Map", "$DateValue", "$ArrayIteratorNextIndex", "$IteratedObject",
   "$StringIteratorNextIndex", "$IteratedString", "_isPartial", "_isSimple"];

  setupBindings() {
    for (let propName of ObjectValue.trackedProperties) {
      let desc = { writeable: true, value: undefined };
      (this: any)[propName + "_binding"] = { descriptor: desc, object: this, key: propName };
    }
  }

  static setupTrackedPropertyAccessors() {
    for (let propName of ObjectValue.trackedProperties) {
      Object.defineProperty(ObjectValue.prototype, propName,
        { configurable: true,
          get: function() {
            let binding = this[propName + "_binding"];
            return binding.descriptor.value;
          },
          set: function(v) {
            let binding = this[propName + "_binding"];
            this.$Realm.recordModifiedProperty(binding);
            binding.descriptor.value = v;
          }
        });
    }
  }

  $Prototype: ObjectValue | NullValue;
  $Extensible: BooleanValue;

  $ParameterMap: void | ObjectValue;
  $SymbolData: void | SymbolValue;
  $StringData: void | StringValue;
  $NumberData: void | NumberValue;
  $BooleanData: void | BooleanValue;

  // error
  $ErrorData: void;
  $ContextStack: void | Array<ExecutionContext>;


  // function
  $Call: ?(thisArgument: Value, argumentsList: Array<Value>) => Value;
  $Construct: ?(argumentsList: Array<Value>, newTarget: ObjectValue) => ObjectValue;

  // promise
  $Promise: ?ObjectValue;
  $AlreadyResolved: void | { value: boolean };
  $PromiseState: void | "pending" | "fulfilled" | "rejected";
  $PromiseResult: void | Value;
  $PromiseFulfillReactions: void | Array<PromiseReaction>;
  $PromiseRejectReactions: void | Array<PromiseReaction>;
  $PromiseIsHandled: void | boolean;
  $Capability: void | PromiseCapability;
  $AlreadyCalled: void | { value: boolean };
  $Index: void | number;
  $Values: void | Array<Value>;
  $Capabilities: void | PromiseCapability;
  $RemainingElements: void | { value: number };

  // set
  $SetIterationKind: void | IterationKind;
  $SetNextIndex: void | number;
  $IteratedSet: void | ObjectValue | UndefinedValue;
  $SetData: void | Array<void | Value>;

  // map
  $MapIterationKind: void | IterationKind;
  $MapNextIndex: void | NumberValue;
  $MapData: void | Array<{$Key: void | Value, $Value: void | Value}>;
  $Map: void | ObjectValue | UndefinedValue;

  // weak map
  $WeakMapData: void | Array<{$Key: void | Value, $Value: void | Value}>;

  // weak set
  $WeakSetData: void | Array<void | Value>;

  // date
  $DateValue: void | Value; // of type number

  // array
  $ArrayIterationKind: void | IterationKind;
  $ArrayIteratorNextIndex: void | NumberValue;
  $IteratedObject: void | UndefinedValue | ObjectValue;

  // regex
  $OriginalSource: void | string;
  $OriginalFlags: void | string;
  $RegExpMatcher: void | ((S: string, lastIndex: number) => ?{endIndex: number, captures: Array<any>});

  // string
  $StringIteratorNextIndex: void | number;
  $IteratedString: void | StringValue;

  // data view
  $DataView: void | true;
  $ViewedArrayBuffer: void | ObjectValue;
  $ByteLength: void | number;
  $ByteOffset: void | number;

  // array buffer
  $ArrayBufferData: void | null | DataBlock;
  $ArrayBufferByteLength: void | number;

  // generator
  $GeneratorState: void | "suspendedStart" | "executing";
  $GeneratorContext: void | ExecutionContext;

  // typed array
  $TypedArrayName: void | string;
  $ViewedArrayBuffer: void | ObjectValue;
  $ArrayLength: void | number;

  // partial objects
  _isPartial: BooleanValue;

  // If true, the object has no property getters or setters and it is safe
  // to return AbstractValue for unknown properties.
  _isSimple: BooleanValue;

  properties: Map<string, PropertyBinding>;
  symbols: Map<SymbolValue, PropertyBinding>;

  mightNotBeObject(): boolean {
    return false;
  }

  throwIfNotObject(): ObjectValue {
    return this;
  }

  makeNotPartial(): void {
    this._isPartial = this.$Realm.intrinsics.false;
  }

  makePartial(): void {
    this._isPartial = this.$Realm.intrinsics.true;
  }

  makeSimple(): void {
    this._isSimple = this.$Realm.intrinsics.true;
  }

  isPartial(): boolean {
    return this._isPartial.value;
  }

  isSimple(): boolean {
    return this._isSimple.value;
  }

  getExtensible(): boolean {
    return this.$Extensible.value;
  }

  setExtensible(v: boolean) {
    this.$Extensible = v ? this.$Realm.intrinsics.true : this.$Realm.intrinsics.false;
  }

  defineNativeMethod(name: SymbolValue | string, length: number, callback: NativeFunctionCallback, desc?: Descriptor = {}) {
    let intrinsicName;
    if (typeof name === "string") {
      if (this.intrinsicName) intrinsicName = `${this.intrinsicName}.${name}`;
    } else if (name instanceof SymbolValue) {
      if (this.intrinsicName && name.intrinsicName) intrinsicName = `${this.intrinsicName}[${name.intrinsicName}]`;
    } else {
      invariant(false);
    }
    this.defineNativeProperty(
        name,
        new NativeFunctionValue(
            this.$Realm,
            intrinsicName,
            name,
            length,
            callback,
            false
        ),
        desc
    );
  }

  defineNativeProperty(name: SymbolValue | string, value?: Value, desc?: Descriptor = {}) {
    this.$DefineOwnProperty(name, {
      value,
      writable: true,
      enumerable: false,
      configurable: true,
      ...desc
    });
  }

  defineNativeGetter(name: SymbolValue | string, callback: NativeFunctionCallback, desc?: Descriptor = {}) {
    let intrinsicName, funcName;
    if (typeof name === "string") {
      funcName = `get ${name}`;
      if (this.intrinsicName) intrinsicName = `${this.intrinsicName}.${name}`;
    } else if (name instanceof SymbolValue) {
      funcName = `get [${name.$Description || "?"}]`;
      if (this.intrinsicName && name.intrinsicName) intrinsicName = `${this.intrinsicName}[${name.intrinsicName}]`;
    } else {
      invariant(false);
    }

    let func = new NativeFunctionValue(this.$Realm, intrinsicName, funcName, 0, callback);
    func.$Construct = undefined;
    func.$ConstructorKind = undefined;
    this.$DefineOwnProperty(name, {
      get: func,
      set: this.$Realm.intrinsics.undefined,
      enumerable: false,
      configurable: true,
      ...desc
    });
  }

  defineNativeConstant(name: SymbolValue | string, value?: Value, desc?: Descriptor = {}) {
    this.$DefineOwnProperty(name, {
      value,
      writable: false,
      enumerable: false,
      configurable: false,
      ...desc
    });
  }

  getOwnPropertyKeysArray(): Array<string> {
    if (this.isPartial()) {
      AbstractValue.throwIntrospectionError(this);
    }

    let o = this;
    let keyArray = Array.from(o.properties.keys());
    keyArray = keyArray.filter(
      function (x) {
         let pb = o.properties.get(x);
         if (!pb || pb.descriptor === undefined) return false;
         let pv = pb.descriptor.value;
         if (pv === undefined) return true;
         if (!pv.mightHaveBeenDeleted()) return true;
         // The property may or may not be there at runtime.
         // We can at best return an abstract keys array.
         // For now just terminate.
         invariant(pv instanceof AbstractValue);
         AbstractValue.throwIntrospectionError(pv);
      });
    return keyArray;
  }

  _serialize(set: Function, stack: Map<Value, any>): any {
    let obj = set({});

    for (let [key, propertyBinding] of this.properties) {
      let desc = propertyBinding.descriptor;
      if (desc === undefined) continue; // deleted
      ThrowIfMightHaveBeenDeleted(desc.value);
      let serializedDesc: any = { enumerable: desc.enumerable, configurable: desc.configurable };
      if (desc.value) {
        serializedDesc.writable = desc.writable;
        serializedDesc.value = desc.value.serialize(stack);
      } else {
        invariant(desc.get !== undefined);
        serializedDesc.get = desc.get.serialize(stack);
        invariant(desc.set !== undefined);
        serializedDesc.set = desc.set.serialize(stack);
      }
      Object.defineProperty(obj, key, serializedDesc);
    }
    return obj;
  }

  // ECMA262 9.1.1
  $GetPrototypeOf(): ObjectValue | NullValue {
    return this.$Prototype;
  }

  // ECMA262 9.1.2
  $SetPrototypeOf(V: ObjectValue | NullValue): boolean {
    // 1. Return ! OrdinarySetPrototypeOf(O, V).
    return OrdinarySetPrototypeOf(this.$Realm, this, V);
  }

  // ECMA262 9.1.3
  $IsExtensible(): boolean {
    // 1. Return ! OrdinaryIsExtensible(O).
    return OrdinaryIsExtensible(this.$Realm, this);
  }

  // ECMA262 9.1.4
  $PreventExtensions(): boolean {
    // 1. Return ! OrdinaryPreventExtensions(O).
    return OrdinaryPreventExtensions(this.$Realm, this);
  }

  // ECMA262 9.1.5
  $GetOwnProperty(P: PropertyKeyValue): Descriptor | void {
    // 1. Return ! OrdinaryGetOwnProperty(O, P).
    return OrdinaryGetOwnProperty(this.$Realm, this, P);
  }

  // ECMA262 9.1.6
  $DefineOwnProperty(P: PropertyKeyValue, Desc: Descriptor): boolean {
    // 1. Return ? OrdinaryDefineOwnProperty(O, P, Desc).
    return OrdinaryDefineOwnProperty(this.$Realm, this, P, Desc);
  }

  // ECMA262 9.1.7
  $HasProperty(P: PropertyKeyValue): boolean {
    return OrdinaryHasProperty(this.$Realm, this, P);
  }

  // ECMA262 9.1.8
  $Get(P: PropertyKeyValue, Receiver: Value): Value {
    // 1. Return ? OrdinaryGet(O, P, Receiver).
    return OrdinaryGet(this.$Realm, this, P, Receiver);
  }

  // ECMA262 9.1.9
  $Set(P: PropertyKeyValue, V: Value, Receiver: Value): boolean {
    // 1. Return ? OrdinarySet(O, P, V, Receiver).
    return OrdinarySet(this.$Realm, this, P, V, Receiver);
  }

  // ECMA262 9.1.10
  $Delete(P: PropertyKeyValue): boolean {
    // 1. Return ? OrdinaryDelete(O, P).
    return OrdinaryDelete(this.$Realm, this, P);
  }

  // ECMA262 9.1.11
  $OwnPropertyKeys(): Array<PropertyKeyValue> {
    return OrdinaryOwnPropertyKeys(this.$Realm, this);
  }
}
