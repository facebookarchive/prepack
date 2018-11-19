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
import { ValuesDomain } from "../domains/index.js";
import { FatalError } from "../errors.js";
import type {
  DataBlock,
  IterationKind,
  ObjectKind,
  PromiseReaction,
  PropertyBinding,
  PropertyKeyValue,
  TypedArrayKind,
} from "../types.js";
import {
  AbstractObjectValue,
  AbstractValue,
  BooleanValue,
  ConcreteValue,
  NativeFunctionValue,
  NullValue,
  NumberValue,
  StringValue,
  SymbolValue,
  UndefinedValue,
  Value,
} from "./index.js";
import { isReactElement } from "../react/utils.js";
import { ECMAScriptSourceFunctionValue, type NativeFunctionCallback } from "./index.js";
import {
  Get,
  IsDataDescriptor,
  OrdinaryOwnPropertyKeys,
  OrdinaryGet,
  OrdinaryGetPartial,
  OrdinaryHasProperty,
  OrdinaryIsExtensible,
  OrdinaryPreventExtensions,
} from "../methods/index.js";
import { Properties } from "../singletons.js";
import invariant from "../invariant.js";
import type { typeAnnotation } from "@babel/types";
import { createOperationDescriptor } from "../utils/generator.js";
import { Descriptor, PropertyDescriptor, type DescriptorInitializer, InternalSlotDescriptor } from "../descriptors.js";

export default class ObjectValue extends ConcreteValue {
  constructor(
    realm: Realm,
    proto?: ObjectValue | NullValue,
    intrinsicName?: string,
    refuseSerialization: boolean = false
  ) {
    super(realm, intrinsicName);
    realm.recordNewObject(this);
    if (realm.useAbstractInterpretation) this.setupBindings(this.getTrackedPropertyNames());
    this.$Prototype = proto || realm.intrinsics.null;
    this.$Extensible = realm.intrinsics.true;
    this._isPartial = realm.intrinsics.false;
    this._isLeaked = realm.intrinsics.false;
    this._isSimple = realm.intrinsics.false;
    this._simplicityIsTransitive = realm.intrinsics.false;
    this._isFinal = realm.intrinsics.false;
    this.properties = new Map();
    this.symbols = new Map();
    this.refuseSerialization = refuseSerialization;

    // this.$IsClassPrototype should be the last thing that gets initialized,
    // as other code checks whether this.$IsClassPrototype === undefined
    // as a proxy for whether initialization is still ongoing.
    this.$IsClassPrototype = false;
  }

  static trackedPropertyNames = [
    "_isPartial",
    "_isLeaked",
    "_isSimple",
    "_isFinal",
    "_simplicityIsTransitive",
    "_temporalAlias",
    "$ArrayIteratorNextIndex",
    "$DateValue",
    "$Extensible",
    "$IteratedList",
    "$IteratedObject",
    "$IteratedSet",
    "$IteratedString",
    "$Map",
    "$MapData",
    "$MapNextIndex",
    "$Prototype",
    "$SetData",
    "$SetNextIndex",
    "$StringIteratorNextIndex",
    "$WeakMapData",
    "$WeakSetData",
  ];
  static trackedPropertyBindingNames = new Map();

  getTrackedPropertyNames(): Array<string> {
    return ObjectValue.trackedPropertyNames;
  }

  setupBindings(propertyNames: Array<string>): void {
    for (let propName of propertyNames) {
      let propBindingName = ObjectValue.trackedPropertyBindingNames.get(propName);
      invariant(propBindingName !== undefined);
      (this: any)[propBindingName] = undefined;
    }
  }

  static setupTrackedPropertyAccessors(propertyNames: Array<string>): void {
    for (let propName of propertyNames) {
      let propBindingName = ObjectValue.trackedPropertyBindingNames.get(propName);
      if (propBindingName === undefined)
        ObjectValue.trackedPropertyBindingNames.set(propName, (propBindingName = propName + "_binding"));
      Object.defineProperty(ObjectValue.prototype, propName, {
        configurable: true,
        get: function() {
          let binding = this[propBindingName];
          invariant(binding === undefined || binding.descriptor instanceof InternalSlotDescriptor);
          return binding === undefined ? undefined : binding.descriptor.value;
        },
        set: function(v) {
          // Let's make sure that the object is not leaked.
          // To that end, we'd like to call this.isLeakedObject().
          // However, while the object is still being initialized,
          // properties may be set, but this.isLeakedObject() may not be called yet.
          // To check if we are still initializing, guard the call by looking at
          // whether this.$IsClassPrototype has been initialized as a proxy for
          // object initialization in general.
          invariant(
            // We're still initializing so we can set a property.
            this.$IsClassPrototype === undefined ||
              // It's not leaked so we can set a property.
              this.mightNotBeLeakedObject() ||
              // Object.assign() implementation needs to temporarily
              // make potentially leaked objects non-partial and back.
              // We don't gain anything from checking whether it's leaked
              // before calling makePartial() so we'll whitelist this property.
              propBindingName === "_isPartial_binding",
            "cannot mutate a leaked object"
          );
          let binding = this[propBindingName];
          if (binding === undefined) {
            let desc = new InternalSlotDescriptor(undefined);
            this[propBindingName] = binding = {
              descriptor: desc,
              object: this,
              key: propName,
              internalSlot: true,
            };
          }
          this.$Realm.recordModifiedProperty(binding);
          binding.descriptor.value = v;
        },
      });
    }
  }

  $Prototype: ObjectValue | AbstractObjectValue | NullValue;
  $Extensible: BooleanValue | AbstractValue;

  $ParameterMap: void | ObjectValue; // undefined when the property is "missing"
  $SymbolData: void | SymbolValue | AbstractValue;
  $StringData: void | StringValue | AbstractValue;
  $NumberData: void | NumberValue | AbstractValue;
  $BooleanData: void | BooleanValue | AbstractValue;

  // error
  $ErrorData: void | {
    // undefined when the property is "missing"
    contextStack: Array<ExecutionContext>,
    locationData: void | {
      filename: string,
      sourceCode: string,
      loc: { line: number, column: number },
      stackDecorated: boolean,
    },
  };

  // function
  $Call: void | ((thisArgument: Value, argumentsList: Array<Value>) => Value);
  $Construct: void | ((argumentsList: Array<Value>, newTarget: ObjectValue) => ObjectValue | AbstractObjectValue);

  // promise
  $PromiseState: void | "pending" | "fulfilled" | "rejected";
  $PromiseResult: void | Value;
  $PromiseFulfillReactions: void | Array<PromiseReaction>;
  $PromiseRejectReactions: void | Array<PromiseReaction>;
  $PromiseIsHandled: void | boolean;

  // iterator
  $IteratedList: void | Array<Value>;
  $ListIteratorNextIndex: void | number;
  $IteratorNext: void | NativeFunctionValue;

  // set
  $SetIterationKind: void | IterationKind;
  $SetNextIndex: void | number;
  $IteratedSet: void | ObjectValue | UndefinedValue;
  $SetData: void | Array<void | Value>;

  // react
  $SuperTypeParameters: void | typeAnnotation;

  // map
  $MapIterationKind: void | IterationKind;
  $MapNextIndex: void | NumberValue;
  $MapData: void | Array<{ $Key: void | Value, $Value: void | Value }>;
  $Map: void | ObjectValue | UndefinedValue;

  // weak map
  $WeakMapData: void | Array<{ $Key: void | Value, $Value: void | Value }>;

  // weak set
  $WeakSetData: void | Array<void | Value>;

  // date
  $DateValue: void | NumberValue | AbstractValue; // of type number

  // array
  $ArrayIterationKind: void | IterationKind;
  $ArrayIteratorNextIndex: void | NumberValue;
  $IteratedObject: void | UndefinedValue | ObjectValue;

  // regex
  $OriginalSource: void | string;
  $OriginalFlags: void | string;
  $RegExpMatcher: void | ((S: string, lastIndex: number) => ?{ endIndex: number, captures: Array<any> });

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
  $TypedArrayName: void | TypedArrayKind;
  $ViewedArrayBuffer: void | ObjectValue;
  $ArrayLength: void | number;

  // backpointer to the constructor if this object was created its prototype object
  originalConstructor: void | ECMAScriptSourceFunctionValue;

  // partial objects
  _isPartial: AbstractValue | BooleanValue;

  // tainted objects
  _isLeaked: AbstractValue | BooleanValue;

  // If true, the object has no property getters or setters and it is safe
  // to return AbstractValue for unknown properties.
  _isSimple: AbstractValue | BooleanValue;

  // If true, it is not safe to perform any more mutations that would change
  // the object's serialized form.
  _isFinal: AbstractValue | BooleanValue;

  // Specifies whether the object is a template that needs to be created in a scope
  // If set, this happened during object initialization and the value is never changed again, so not tracked.
  isScopedTemplate: void | true;

  // If true, then unknown properties should return transitively simple abstract object values
  _simplicityIsTransitive: AbstractValue | BooleanValue;

  // The abstract object for which this object is the template.
  // Use this instead of the object itself when deriving temporal values for object properties.
  _templateFor: void | AbstractObjectValue;

  properties: Map<string, PropertyBinding>;
  symbols: Map<SymbolValue, PropertyBinding>;
  unknownProperty: void | PropertyBinding;
  _temporalAlias: void | AbstractObjectValue;

  // An object value with an intrinsic name can either exist from the beginning of time,
  // or it can be associated with a particular point in time by being used as a template
  // when deriving an abstract value via a generator.
  intrinsicNameGenerated: void | true;
  hashValue: void | number;

  // ReactElement
  $BailOutReason: void | string;

  // ES2015 classes
  $IsClassPrototype: boolean;

  // We track some internal state as properties on the global object, these should
  // never be serialized.
  refuseSerialization: boolean;

  // Checks whether effects are properly applied.
  isValid(): boolean {
    return this._isPartial !== undefined;
  }

  equals(x: Value): boolean {
    return this === x;
  }

  getHash(): number {
    if (!this.hashValue) {
      this.hashValue = ++this.$Realm.objectCount;
    }
    return this.hashValue;
  }

  get temporalAlias(): void | AbstractObjectValue {
    return this._temporalAlias;
  }

  set temporalAlias(value: AbstractObjectValue) {
    this._temporalAlias = value;
  }

  hasStringOrSymbolProperties(): boolean {
    for (let prop of this.properties.values()) {
      if (prop.descriptor === undefined) continue;
      return true;
    }
    for (let prop of this.symbols.values()) {
      if (prop.descriptor === undefined) continue;
      return true;
    }
    return false;
  }

  mightBeFalse(): boolean {
    return false;
  }

  mightNotBeObject(): boolean {
    return false;
  }

  throwIfNotObject(): ObjectValue {
    return this;
  }

  makePartial(): void {
    this._isPartial = this.$Realm.intrinsics.true;
  }

  makeSimple(option?: string | Value): void {
    this._isSimple = this.$Realm.intrinsics.true;
    this._simplicityIsTransitive = new BooleanValue(
      this.$Realm,
      option === "transitive" || (option instanceof StringValue && option.value === "transitive")
    );
  }

  makeFinal(): void {
    this._isFinal = this.$Realm.intrinsics.true;
  }

  makeNotFinal(): void {
    this._isFinal = this.$Realm.intrinsics.false;
  }

  isPartialObject(): boolean {
    return this._isPartial.mightBeTrue();
  }

  // When this object was created in an evaluateForEffects context and the effects have not been applied, the
  // value is not valid (and we shouldn't try to access any properties on it). isPartial should always be set
  // except when reverted by effects.
  isValid(): boolean {
    return this._isPartial !== undefined;
  }

  mightBeFinalObject(): boolean {
    return this._isFinal.mightBeTrue();
  }

  mightNotBeFinalObject(): boolean {
    return this._isFinal.mightNotBeTrue();
  }

  leak(): void {
    this._isLeaked = this.$Realm.intrinsics.true;
  }

  mightBeLeakedObject(): boolean {
    return this._isLeaked.mightBeTrue();
  }

  mightNotBeLeakedObject(): boolean {
    return this._isLeaked.mightNotBeTrue();
  }

  isSimpleObject(): boolean {
    if (this === this.$Realm.intrinsics.ObjectPrototype) return true;
    if (!this._isSimple.mightNotBeTrue()) return true;
    if (this.isPartialObject()) return false;
    if (this.symbols.size > 0) return false;
    for (let propertyBinding of this.properties.values()) {
      let desc = propertyBinding.descriptor;
      if (desc === undefined) continue; // deleted
      if (!IsDataDescriptor(this.$Realm, desc)) return false;
      if (!desc.writable) return false;
    }
    if (this.$Prototype instanceof NullValue) return true;
    invariant(this.$Prototype);
    return this.$Prototype.isSimpleObject();
  }

  isTransitivelySimple(): boolean {
    return !this._simplicityIsTransitive.mightNotBeTrue();
  }

  getExtensible(): boolean {
    return this.$Extensible.throwIfNotConcreteBoolean().value;
  }

  setExtensible(v: boolean) {
    this.$Extensible = v ? this.$Realm.intrinsics.true : this.$Realm.intrinsics.false;
  }

  getKind(): ObjectKind {
    // we can deduce the natural prototype by checking whether the following internal slots are present
    if (this.$SymbolData !== undefined) return "Symbol";
    if (this.$StringData !== undefined) return "String";
    if (this.$NumberData !== undefined) return "Number";
    if (this.$BooleanData !== undefined) return "Boolean";
    if (this.$DateValue !== undefined) return "Date";
    if (this.$RegExpMatcher !== undefined) return "RegExp";
    if (this.$SetData !== undefined) return "Set";
    if (this.$MapData !== undefined) return "Map";
    if (this.$DataView !== undefined) return "DataView";
    if (this.$ArrayBufferData !== undefined) return "ArrayBuffer";
    if (this.$WeakMapData !== undefined) return "WeakMap";
    if (this.$WeakSetData !== undefined) return "WeakSet";
    if (isReactElement(this) && this.$Realm.react.enabled) return "ReactElement";
    if (this.$TypedArrayName !== undefined) return this.$TypedArrayName;
    // TODO #26 #712: Promises. All kinds of iterators. Generators.
    return "Object";
  }

  defineNativeMethod(
    name: SymbolValue | string,
    length: number,
    callback: NativeFunctionCallback,
    desc?: DescriptorInitializer
  ): Value {
    let intrinsicName;
    if (typeof name === "string") {
      if (this.intrinsicName) intrinsicName = `${this.intrinsicName}.${name}`;
    } else if (name instanceof SymbolValue) {
      if (this.intrinsicName && name.intrinsicName) intrinsicName = `${this.intrinsicName}[${name.intrinsicName}]`;
    } else {
      invariant(false);
    }
    let fnValue = new NativeFunctionValue(this.$Realm, intrinsicName, name, length, callback, false);
    this.defineNativeProperty(name, fnValue, desc);
    return fnValue;
  }

  defineNativeProperty(name: SymbolValue | string, value?: Value | Array<Value>, desc?: DescriptorInitializer): void {
    invariant(!value || value instanceof Value);
    this.$DefineOwnProperty(
      name,
      new PropertyDescriptor({
        value,
        writable: true,
        enumerable: false,
        configurable: true,
        ...desc,
      })
    );
  }

  defineNativeGetter(name: SymbolValue | string, callback: NativeFunctionCallback, desc?: DescriptorInitializer): void {
    let intrinsicName, funcName;
    if (typeof name === "string") {
      funcName = `get ${name}`;
      if (this.intrinsicName) intrinsicName = `${this.intrinsicName}.${name}`;
    } else if (name instanceof SymbolValue) {
      funcName =
        name.$Description instanceof Value
          ? `get [${name.$Description.throwIfNotConcreteString().value}]`
          : `get [${"?"}]`;
      if (this.intrinsicName && name.intrinsicName) intrinsicName = `${this.intrinsicName}[${name.intrinsicName}]`;
    } else {
      invariant(false);
    }

    let func = new NativeFunctionValue(this.$Realm, intrinsicName, funcName, 0, callback);
    this.$DefineOwnProperty(
      name,
      new PropertyDescriptor({
        get: func,
        set: this.$Realm.intrinsics.undefined,
        enumerable: false,
        configurable: true,
        ...desc,
      })
    );
  }

  defineNativeConstant(name: SymbolValue | string, value?: Value | Array<Value>, desc?: DescriptorInitializer): void {
    invariant(!value || value instanceof Value);
    this.$DefineOwnProperty(
      name,
      new PropertyDescriptor({
        value,
        writable: false,
        enumerable: false,
        configurable: false,
        ...desc,
      })
    );
  }

  // Note that internal properties will not be copied to the snapshot, nor will they be removed.
  getSnapshot(options?: { removeProperties: boolean }): AbstractObjectValue {
    try {
      if (this.temporalAlias !== undefined) return this.temporalAlias;
      let realm = this.$Realm;
      let template = new ObjectValue(this.$Realm, this.$Realm.intrinsics.ObjectPrototype);
      let keys = Properties.GetOwnPropertyKeysArray(realm, this, false, true);
      this.copyKeys(((keys: any): Array<PropertyKeyValue>), this, template);
      // The snapshot is an immutable object snapshot
      template.makeFinal();
      // The original object might be a React props object, thus
      // if it is, we need to ensure we mark it with the same rules
      if (realm.react.enabled && realm.react.reactProps.has(this)) {
        realm.react.reactProps.add(template);
      }
      let operationDescriptor = createOperationDescriptor("SINGLE_ARG");
      let result = AbstractValue.createTemporalFromBuildFunction(
        this.$Realm,
        ObjectValue,
        [template],
        operationDescriptor,
        { skipInvariant: true, isPure: true }
      );
      invariant(result instanceof AbstractObjectValue);
      result.values = new ValuesDomain(template);
      return result;
    } finally {
      if (options && options.removeProperties) {
        this.properties = new Map();
        this.symbols = new Map();
        this.unknownProperty = undefined;
      }
    }
  }

  copyKeys(keys: Array<PropertyKeyValue>, from: ObjectValue, to: ObjectValue): void {
    // c. Repeat for each element nextKey of keys in List order,
    for (let nextKey of keys) {
      // i. Let desc be ? from.[[GetOwnProperty]](nextKey).
      let desc = from.$GetOwnProperty(nextKey);

      // ii. If desc is not undefined and desc.[[Enumerable]] is true, then
      if (desc && desc.throwIfNotConcrete(this.$Realm).enumerable) {
        Properties.ThrowIfMightHaveBeenDeleted(desc);

        // 1. Let propValue be ? Get(from, nextKey).
        let propValue = Get(this.$Realm, from, nextKey);

        // 2. Perform ? Set(to, nextKey, propValue, true).
        Properties.Set(this.$Realm, to, nextKey, propValue, true);
      }
    }
  }

  _serialize(set: Function, stack: Map<Value, any>): any {
    let obj = set({});

    for (let [key, propertyBinding] of this.properties) {
      let desc = propertyBinding.descriptor;
      if (desc === undefined) continue; // deleted
      Properties.ThrowIfMightHaveBeenDeleted(desc);
      desc = desc.throwIfNotConcrete(this.$Realm);
      let serializedDesc: any = { enumerable: desc.enumerable, configurable: desc.configurable };
      if (desc.value) {
        serializedDesc.writable = desc.writable;
        invariant(desc.value instanceof Value);
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

  // Whether [[{Get,Set}PrototypeOf]] delegate to Ordinary{Get,Set}PrototypeOf.
  // E.g. ProxyValue overrides this to return false.
  // See ECMA262 9.1.2.1 for an algorithm where this is relevant
  usesOrdinaryObjectInternalPrototypeMethods(): boolean {
    return true;
  }

  // ECMA262 9.1.1
  $GetPrototypeOf(): ObjectValue | AbstractObjectValue | NullValue {
    return this.$Prototype;
  }

  // ECMA262 9.1.2
  $SetPrototypeOf(V: ObjectValue | NullValue): boolean {
    // 1. Return ! OrdinarySetPrototypeOf(O, V).
    return Properties.OrdinarySetPrototypeOf(this.$Realm, this, V);
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
    return Properties.OrdinaryGetOwnProperty(this.$Realm, this, P);
  }

  // ECMA262 9.1.6
  $DefineOwnProperty(P: PropertyKeyValue, Desc: Descriptor): boolean {
    // 1. Return ? OrdinaryDefineOwnProperty(O, P, Desc).
    return Properties.OrdinaryDefineOwnProperty(this.$Realm, this, P, Desc);
  }

  // ECMA262 9.1.7
  $HasProperty(P: PropertyKeyValue): boolean {
    if (this.unknownProperty !== undefined && this.$GetOwnProperty(P) === undefined) {
      AbstractValue.reportIntrospectionError(this, P);
      throw new FatalError();
    }

    return OrdinaryHasProperty(this.$Realm, this, P);
  }

  // ECMA262 9.1.8
  $Get(P: PropertyKeyValue, Receiver: Value): Value {
    // 1. Return ? OrdinaryGet(O, P, Receiver).
    return OrdinaryGet(this.$Realm, this, P, Receiver);
  }

  _SafeGetDataPropertyValue(P: PropertyKeyValue): Value {
    let savedInvariantLevel = this.$Realm.invariantLevel;
    try {
      this.$Realm.invariantLevel = 0;
      let desc = this.$GetOwnProperty(P);
      if (desc === undefined) {
        return this.$Realm.intrinsics.undefined;
      }
      desc = desc.throwIfNotConcrete(this.$Realm);
      return desc.value ? desc.value : this.$Realm.intrinsics.undefined;
    } finally {
      this.$Realm.invariantLevel = savedInvariantLevel;
    }
  }

  $GetPartial(P: AbstractValue | PropertyKeyValue, Receiver: Value): Value {
    return OrdinaryGetPartial(this.$Realm, this, P, Receiver);
  }

  // ECMA262 9.1.9
  $Set(P: PropertyKeyValue, V: Value, Receiver: Value): boolean {
    // 1. Return ? OrdinarySet(O, P, V, Receiver).
    return Properties.OrdinarySet(this.$Realm, this, P, V, Receiver);
  }

  $SetPartial(P: AbstractValue | PropertyKeyValue, V: Value, Receiver: Value): boolean {
    return Properties.OrdinarySetPartial(this.$Realm, this, P, V, Receiver);
  }

  // ECMA262 9.1.10
  $Delete(P: PropertyKeyValue): boolean {
    if (this.unknownProperty !== undefined) {
      // TODO #946: generate a delete from the object
      AbstractValue.reportIntrospectionError(this, P);
      throw new FatalError();
    }

    // 1. Return ? OrdinaryDelete(O, P).
    return Properties.OrdinaryDelete(this.$Realm, this, P);
  }

  // ECMA262 9.1.11
  $OwnPropertyKeys(getOwnPropertyKeysEvenIfPartial?: boolean = false): Array<PropertyKeyValue> {
    return OrdinaryOwnPropertyKeys(this.$Realm, this, getOwnPropertyKeysEvenIfPartial);
  }

  static refuseSerializationOnPropertyBinding(pb: PropertyBinding): boolean {
    if (pb.object.refuseSerialization) return true;
    if (pb.internalSlot && typeof pb.key === "string" && pb.key[0] === "_") return true;
    return false;
  }

  static isIntrinsicDerivedObject(obj: Value): boolean {
    return obj instanceof ObjectValue && obj.intrinsicName !== undefined && obj.isScopedTemplate !== undefined;
  }
}
