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
import { TypesDomain, ValuesDomain } from "../domains/index.js";
import { CompilerDiagnostic, FatalError } from "../errors.js";
import type {
  DataBlock,
  Descriptor,
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
  ArrayValue,
  BooleanValue,
  ConcreteValue,
  NativeFunctionValue,
  NullValue,
  NumberValue,
  StringValue,
  SymbolValue,
  UndefinedValue,
  Value,
  PrimitiveValue,
} from "./index.js";
import { isReactElement } from "../react/utils.js";
import buildExpressionTemplate from "../utils/builder.js";
import { ECMAScriptSourceFunctionValue, type NativeFunctionCallback } from "./index.js";
import {
  Get,
  GetFromArrayWithWidenedNumericProperty,
  IsDataDescriptor,
  OrdinaryOwnPropertyKeys,
  OrdinaryGet,
  OrdinaryHasProperty,
  OrdinaryIsExtensible,
  OrdinaryPreventExtensions,
  HasCompatibleType,
} from "../methods/index.js";
import { Havoc, Properties, To } from "../singletons.js";
import invariant from "../invariant.js";
import type { typeAnnotation } from "@babel/types";
import { createOperationDescriptor } from "../utils/generator.js";

function isWidenedValue(v: void | Value) {
  if (!(v instanceof AbstractValue)) return false;
  if (v.kind === "widened" || v.kind === "widened property") return true;
  for (let a of v.args) {
    if (isWidenedValue(a)) return true;
  }
  return false;
}

const lengthTemplateSrc = "(A).length";
const lengthTemplate = buildExpressionTemplate(lengthTemplateSrc);

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
    this._isHavoced = realm.intrinsics.false;
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
    "_isHavoced",
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
          return binding === undefined ? undefined : binding.descriptor.value;
        },
        set: function(v) {
          // Let's make sure that the object is not havoced.
          // To that end, we'd like to call this.isHavocedObject().
          // However, while the object is still being initialized,
          // properties may be set, but this.isHavocedObject() may not be called yet.
          // To check if we are still initializing, guard the call by looking at
          // whether this.$IsClassPrototype has been initialized as a proxy for
          // object initialization in general.
          invariant(
            // We're still initializing so we can set a property.
            this.$IsClassPrototype === undefined ||
              // It's not havoced so we can set a property.
              this.mightNotBeHavocedObject() ||
              // Object.assign() implementation needs to temporarily
              // make potentially havoced objects non-partial and back.
              // We don't gain anything from checking whether it's havoced
              // before calling makePartial() so we'll whitelist this property.
              propBindingName === "_isPartial_binding",
            "cannot mutate a havoced object"
          );
          let binding = this[propBindingName];
          if (binding === undefined) {
            let desc = { writeable: true, value: undefined };
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
  $Construct: void | ((argumentsList: Array<Value>, newTarget: ObjectValue) => ObjectValue);

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
  _isHavoced: AbstractValue | BooleanValue;

  // If true, the object has no property getters or setters and it is safe
  // to return AbstractValue for unknown properties.
  _isSimple: AbstractValue | BooleanValue;

  // If true, it is not safe to perform any more mutations that would change
  // the object's serialized form.
  _isFinal: AbstractValue | BooleanValue;

  // Specifies whether the object is a template that needs to be created in a scope
  // If set, this happened during object initialization and the value is never changed again, so not tracked.
  _isScopedTemplate: void | true;

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

  makeNotPartial(): void {
    this._isPartial = this.$Realm.intrinsics.false;
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

  havoc(): void {
    this._isHavoced = this.$Realm.intrinsics.true;
  }

  mightBeHavocedObject(): boolean {
    return this._isHavoced.mightBeTrue();
  }

  mightNotBeHavocedObject(): boolean {
    return this._isHavoced.mightNotBeTrue();
  }

  isSimpleObject(): boolean {
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
    if (this.$Prototype === this.$Realm.intrinsics.ObjectPrototype) return true;
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
    desc?: Descriptor = {}
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

  defineNativeProperty(name: SymbolValue | string, value?: Value | Array<Value>, desc?: Descriptor = {}): void {
    invariant(!value || value instanceof Value);
    this.$DefineOwnProperty(name, {
      value,
      writable: true,
      enumerable: false,
      configurable: true,
      ...desc,
    });
  }

  defineNativeGetter(name: SymbolValue | string, callback: NativeFunctionCallback, desc?: Descriptor = {}): void {
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
    this.$DefineOwnProperty(name, {
      get: func,
      set: this.$Realm.intrinsics.undefined,
      enumerable: false,
      configurable: true,
      ...desc,
    });
  }

  defineNativeConstant(name: SymbolValue | string, value?: Value | Array<Value>, desc?: Descriptor = {}): void {
    invariant(!value || value instanceof Value);
    this.$DefineOwnProperty(name, {
      value,
      writable: false,
      enumerable: false,
      configurable: false,
      ...desc,
    });
  }

  getOwnPropertyKeysArray(allowAbstractKeys: boolean = false): Array<string> {
    if (this.isPartialObject() || this.mightBeHavocedObject() || this.unknownProperty !== undefined) {
      AbstractValue.reportIntrospectionError(this);
      throw new FatalError();
    }

    let keyArray = Array.from(this.properties.keys());
    keyArray = keyArray.filter(x => {
      let pb = this.properties.get(x);
      if (!pb || pb.descriptor === undefined) return false;
      let pv = pb.descriptor.value;
      if (pv === undefined) return true;
      invariant(pv instanceof Value);
      if (!pv.mightHaveBeenDeleted()) return true;
      // The property may or may not be there at runtime.
      // We can at best return an abstract keys array.
      // For now, unless the caller has told us that is okay,
      // just terminate.
      invariant(pv instanceof AbstractValue);
      if (allowAbstractKeys) return true;
      AbstractValue.reportIntrospectionError(pv);
      throw new FatalError();
    });
    this.$Realm.callReportObjectGetOwnProperties(this);
    return keyArray;
  }

  // Note that internal properties will not be copied to the snapshot, nor will they be removed.
  getSnapshot(options?: { removeProperties: boolean }): AbstractObjectValue {
    try {
      if (this.temporalAlias !== undefined) return this.temporalAlias;
      invariant(!this.isPartialObject());
      let template = new ObjectValue(this.$Realm, this.$Realm.intrinsics.ObjectPrototype);
      this.copyKeys(this.$OwnPropertyKeys(), this, template);
      let realm = this.$Realm;
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
      if (desc && desc.enumerable) {
        Properties.ThrowIfMightHaveBeenDeleted(desc.value);

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
      Properties.ThrowIfMightHaveBeenDeleted(desc.value);
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
    let prop = this.unknownProperty;
    if (prop !== undefined && prop.descriptor !== undefined && this.$GetOwnProperty(P) === undefined) {
      let desc = prop.descriptor;
      invariant(desc !== undefined);
      let val = desc.value;
      invariant(val instanceof AbstractValue);
      let propValue;
      if (P instanceof StringValue) {
        propValue = P;
      } else if (typeof P === "string") {
        propValue = new StringValue(this.$Realm, P);
      }

      if (val.kind === "widened numeric property") {
        invariant(Receiver instanceof ArrayValue && ArrayValue.isIntrinsicAndHasWidenedNumericProperty(Receiver));
        let propName;
        if (P instanceof StringValue) {
          propName = P.value;
        } else {
          propName = P;
        }
        return GetFromArrayWithWidenedNumericProperty(this.$Realm, Receiver, propName);
      } else if (!propValue) {
        AbstractValue.reportIntrospectionError(val, "abstract computed property name");
        throw new FatalError();
      }
      return this.specializeJoin(val, propValue);
    }

    // 1. Return ? OrdinaryGet(O, P, Receiver).
    return OrdinaryGet(this.$Realm, this, P, Receiver);
  }

  _SafeGetDataPropertyValue(P: PropertyKeyValue): Value {
    let savedInvariantLevel = this.$Realm.invariantLevel;
    try {
      this.$Realm.invariantLevel = 0;
      let desc = this.$GetOwnProperty(P);
      return desc !== undefined && desc.value instanceof Value ? desc.value : this.$Realm.intrinsics.undefined;
    } finally {
      this.$Realm.invariantLevel = savedInvariantLevel;
    }
  }

  $GetPartial(P: AbstractValue | PropertyKeyValue, Receiver: Value): Value {
    if (Receiver instanceof AbstractValue && Receiver.getType() === StringValue && P === "length") {
      return AbstractValue.createFromTemplate(this.$Realm, lengthTemplate, NumberValue, [Receiver], lengthTemplateSrc);
    }

    if (!(P instanceof AbstractValue)) return this.$Get(P, Receiver);

    // A string coercion might have side-effects.
    // TODO #1682: We assume that simple objects mean that they don't have a
    // side-effectful valueOf and toString but that's not enforced.
    if (P.mightNotBeString() && P.mightNotBeNumber() && !P.isSimpleObject()) {
      if (this.$Realm.isInPureScope()) {
        // If we're in pure scope, we can havoc the key and keep going.
        // Coercion can only have effects on anything reachable from the key.
        Havoc.value(this.$Realm, P);
      } else {
        let error = new CompilerDiagnostic(
          "property key might not have a well behaved toString or be a symbol",
          this.$Realm.currentLocation,
          "PP0002",
          "RecoverableError"
        );
        if (this.$Realm.handleError(error) !== "Recover") {
          throw new FatalError();
        }
      }
    }

    // We assume that simple objects have no getter/setter properties.
    if (!this.isSimpleObject()) {
      if (this.$Realm.isInPureScope()) {
        // If we're in pure scope, we can havoc the object. Coercion
        // can only have effects on anything reachable from this object.
        // We assume that if the receiver is different than this object,
        // then we only got here because there were no other keys with
        // this name on other parts of the prototype chain.
        // TODO #1675: A fix to 1675 needs to take this into account.
        Havoc.value(this.$Realm, Receiver);
        return AbstractValue.createTemporalFromBuildFunction(
          this.$Realm,
          Value,
          [Receiver, P],
          createOperationDescriptor("OBJECT_GET_PARTIAL"),
          { skipInvariant: true, isPure: true }
        );
      } else {
        let error = new CompilerDiagnostic(
          "unknown property access might need to invoke a getter",
          this.$Realm.currentLocation,
          "PP0030",
          "RecoverableError"
        );
        if (this.$Realm.handleError(error) !== "Recover") {
          throw new FatalError();
        }
      }
    }

    P = To.ToStringAbstract(this.$Realm, P);

    // If all else fails, use this expression
    // TODO #1675: Check the prototype chain for known properties too.
    let result;
    if (this.isPartialObject()) {
      if (isWidenedValue(P)) {
        // TODO #1678: Use a snapshot or havoc this object.
        return AbstractValue.createTemporalFromBuildFunction(
          this.$Realm,
          Value,
          [this, P],
          createOperationDescriptor("OBJECT_GET_PARTIAL"),
          { skipInvariant: true, isPure: true }
        );
      }
      result = AbstractValue.createFromType(this.$Realm, Value, "sentinel member expression", [this, P]);
    } else {
      result = AbstractValue.createTemporalFromBuildFunction(
        this.$Realm,
        Value,
        [this, P],
        createOperationDescriptor("OBJECT_GET_PARTIAL"),
        { skipInvariant: true, isPure: true }
      );
    }

    // Get a specialization of the join of all values written to the object
    // with abstract property names.
    let prop = this.unknownProperty;
    if (prop !== undefined) {
      let desc = prop.descriptor;
      if (desc !== undefined) {
        let val = desc.value;
        invariant(val instanceof AbstractValue);
        if (val.kind === "widened numeric property") {
          invariant(Receiver instanceof ArrayValue && ArrayValue.isIntrinsicAndHasWidenedNumericProperty(Receiver));
          return GetFromArrayWithWidenedNumericProperty(this.$Realm, Receiver, P instanceof StringValue ? P.value : P);
        }
        result = this.specializeJoin(val, P);
      }
    }
    // Join in all of the other values that were written to the object with
    // concrete property names.
    for (let [key, propertyBinding] of this.properties) {
      let desc = propertyBinding.descriptor;
      if (desc === undefined) continue; // deleted
      invariant(desc.value !== undefined); // otherwise this is not simple
      let val = desc.value;
      invariant(val instanceof Value);
      let cond = AbstractValue.createFromBinaryOp(
        this.$Realm,
        "===",
        P,
        new StringValue(this.$Realm, key),
        undefined,
        "check for known property"
      );
      result = AbstractValue.createFromConditionalOp(this.$Realm, cond, val, result);
    }
    return result;
  }

  specializeJoin(absVal: AbstractValue, propName: Value): Value {
    if (absVal.kind === "widened property") {
      let ob = absVal.args[0];
      if (propName instanceof StringValue) {
        let pName = propName.value;
        let pNumber = +pName;
        if (pName === pNumber + "") propName = new NumberValue(this.$Realm, pNumber);
      }
      return AbstractValue.createTemporalFromBuildFunction(
        this.$Realm,
        absVal.getType(),
        [ob, propName],
        createOperationDescriptor("OBJECT_GET_PARTIAL"),
        { skipInvariant: true, isPure: true }
      );
    }
    invariant(absVal.args.length === 3 && absVal.kind === "conditional");
    let generic_cond = absVal.args[0];
    invariant(generic_cond instanceof AbstractValue);
    let cond = this.specializeCond(generic_cond, propName);
    let arg1 = absVal.args[1];
    if (arg1 instanceof AbstractValue && arg1.args.length === 3) arg1 = this.specializeJoin(arg1, propName);
    let arg2 = absVal.args[2];
    if (arg2 instanceof AbstractValue) {
      if (arg2.kind === "template for prototype member expression") {
        let ob = arg2.args[0];
        arg2 = AbstractValue.createTemporalFromBuildFunction(
          this.$Realm,
          absVal.getType(),
          [ob, propName],
          createOperationDescriptor("OBJECT_GET_PARTIAL"),
          { skipInvariant: true, isPure: true }
        );
      } else if (arg2.args.length === 3) {
        arg2 = this.specializeJoin(arg2, propName);
      }
    }
    return AbstractValue.createFromConditionalOp(this.$Realm, cond, arg1, arg2, absVal.expressionLocation);
  }

  specializeCond(absVal: AbstractValue, propName: Value): Value {
    if (absVal.kind === "template for property name condition")
      return AbstractValue.createFromBinaryOp(this.$Realm, "===", absVal.args[0], propName);
    return absVal;
  }

  // ECMA262 9.1.9
  $Set(P: PropertyKeyValue, V: Value, Receiver: Value): boolean {
    // 1. Return ? OrdinarySet(O, P, V, Receiver).
    return Properties.OrdinarySet(this.$Realm, this, P, V, Receiver);
  }

  $SetPartial(P: AbstractValue | PropertyKeyValue, V: Value, Receiver: Value): boolean {
    if (!(P instanceof AbstractValue)) return this.$Set(P, V, Receiver);
    let pIsLoopVar = isWidenedValue(P);
    let pIsNumeric = Value.isTypeCompatibleWith(P.getType(), NumberValue);

    // A string coercion might have side-effects.
    // TODO #1682: We assume that simple objects mean that they don't have a
    // side-effectful valueOf and toString but that's not enforced.
    if (P.mightNotBeString() && P.mightNotBeNumber() && !P.isSimpleObject()) {
      if (this.$Realm.isInPureScope()) {
        // If we're in pure scope, we can havoc the key and keep going.
        // Coercion can only have effects on anything reachable from the key.
        Havoc.value(this.$Realm, P);
      } else {
        let error = new CompilerDiagnostic(
          "property key might not have a well behaved toString or be a symbol",
          this.$Realm.currentLocation,
          "PP0002",
          "RecoverableError"
        );
        if (this.$Realm.handleError(error) !== "Recover") {
          throw new FatalError();
        }
      }
    }

    // We assume that simple objects have no getter/setter properties and
    // that all properties are writable.
    if (!this.isSimpleObject()) {
      if (this.$Realm.isInPureScope()) {
        // If we're in pure scope, we can havoc the object and leave an
        // assignment in place.
        Havoc.value(this.$Realm, Receiver);
        // We also need to havoc the value since it might leak to a setter.
        Havoc.value(this.$Realm, V);
        this.$Realm.evaluateWithPossibleThrowCompletion(
          () => {
            let generator = this.$Realm.generator;
            invariant(generator);
            invariant(P instanceof AbstractValue);
            generator.emitStatement([Receiver, P, V], createOperationDescriptor("OBJECT_SET_PARTIAL"));
            return this.$Realm.intrinsics.undefined;
          },
          TypesDomain.topVal,
          ValuesDomain.topVal
        );
        // The emitted assignment might throw at runtime but if it does, that
        // is handled by evaluateWithPossibleThrowCompletion. Anything that
        // happens after this, can assume we didn't throw and therefore,
        // we return true here.
        return true;
      } else {
        let error = new CompilerDiagnostic(
          "unknown property access might need to invoke a setter",
          this.$Realm.currentLocation,
          "PP0030",
          "RecoverableError"
        );
        if (this.$Realm.handleError(error) !== "Recover") {
          throw new FatalError();
        }
      }
    }

    // We should never consult the prototype chain for unknown properties.
    // If it was simple, it would've been an assignment to the receiver.
    // The only case the Receiver isn't this, if this was a ToObject
    // coercion from a PrimitiveValue.
    invariant(this === Receiver || HasCompatibleType(Receiver, PrimitiveValue));

    P = To.ToStringAbstract(this.$Realm, P);

    function createTemplate(realm: Realm, propName: AbstractValue) {
      return AbstractValue.createFromBinaryOp(
        realm,
        "===",
        propName,
        new StringValue(realm, ""),
        undefined,
        "template for property name condition"
      );
    }

    let prop;
    if (this.unknownProperty === undefined) {
      prop = {
        descriptor: undefined,
        object: this,
        key: P,
      };
      this.unknownProperty = prop;
    } else {
      prop = this.unknownProperty;
    }
    this.$Realm.recordModifiedProperty(prop);
    let desc = prop.descriptor;
    if (desc === undefined) {
      let newVal = V;
      if (!(V instanceof UndefinedValue) && !isWidenedValue(P)) {
        // join V with sentinel, using a property name test as the condition
        let cond = createTemplate(this.$Realm, P);
        let sentinel = AbstractValue.createFromType(this.$Realm, Value, "template for prototype member expression", [
          Receiver,
          P,
        ]);
        newVal = AbstractValue.createFromConditionalOp(this.$Realm, cond, V, sentinel);
      }
      prop.descriptor = {
        writable: true,
        enumerable: true,
        configurable: true,
        value: newVal,
      };
    } else {
      // join V with current value of this.unknownProperty. I.e. weak update.
      let oldVal = desc.value;
      invariant(oldVal instanceof Value);
      let newVal = oldVal;
      if (!(V instanceof UndefinedValue)) {
        if (isWidenedValue(P)) {
          newVal = V; // It will be widened later on
        } else {
          let cond = createTemplate(this.$Realm, P);
          newVal = AbstractValue.createFromConditionalOp(this.$Realm, cond, V, oldVal);
        }
      }
      desc.value = newVal;
    }

    // Since we don't know the name of the property we are writing to, we also need
    // to perform weak updates of all of the known properties.
    // First clear out this.unknownProperty so that helper routines know its OK to update the properties
    let savedUnknownProperty = this.unknownProperty;
    this.unknownProperty = undefined;
    for (let [key, propertyBinding] of this.properties) {
      if (pIsLoopVar && pIsNumeric) {
        // Delete numeric properties and don't do weak updates on other properties.
        if (key !== +key + "") continue;
        this.properties.delete(key);
        continue;
      }
      let oldVal = this.$Realm.intrinsics.empty;
      if (propertyBinding.descriptor && propertyBinding.descriptor.value) {
        oldVal = propertyBinding.descriptor.value;
        invariant(oldVal instanceof Value); // otherwise this is not simple
      }
      let cond = AbstractValue.createFromBinaryOp(this.$Realm, "===", P, new StringValue(this.$Realm, key));
      let newVal = AbstractValue.createFromConditionalOp(this.$Realm, cond, V, oldVal);
      Properties.OrdinarySet(this.$Realm, this, key, newVal, Receiver);
    }
    this.unknownProperty = savedUnknownProperty;

    return true;
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
  $OwnPropertyKeys(): Array<PropertyKeyValue> {
    return OrdinaryOwnPropertyKeys(this.$Realm, this);
  }

  static refuseSerializationOnPropertyBinding(pb: PropertyBinding): boolean {
    if (pb.object.refuseSerialization) return true;
    if (pb.internalSlot && typeof pb.key === "string" && pb.key[0] === "_") return true;
    return false;
  }
}
