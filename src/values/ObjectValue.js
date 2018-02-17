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
import { FatalError } from "../errors.js";
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
import buildExpressionTemplate from "../utils/builder.js";
import { ECMAScriptSourceFunctionValue, type NativeFunctionCallback } from "./index.js";
import {
  IsDataDescriptor,
  OrdinaryOwnPropertyKeys,
  OrdinaryGet,
  OrdinaryHasProperty,
  OrdinaryIsExtensible,
  OrdinaryPreventExtensions,
} from "../methods/index.js";
import { Join, Properties } from "../singletons.js";
import invariant from "../invariant.js";
import type { typeAnnotation } from "babel-types";
import * as t from "babel-types";

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
    this._hasLeaked = realm.intrinsics.false;
    this._isSimple = realm.intrinsics.false;
    this._isFinal = realm.intrinsics.false;
    this.properties = new Map();
    this.symbols = new Map();
    this.refuseSerialization = refuseSerialization;
    this.$IsClassPrototype = false;
  }

  static trackedPropertyNames = [
    "_isPartial",
    "_hasLeaked",
    "_isSimple",
    "_isFinal",
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

  getTrackedPropertyNames(): Array<string> {
    return ObjectValue.trackedPropertyNames;
  }

  setupBindings(propertyNames: Array<string>) {
    for (let propName of propertyNames) {
      let desc = { writeable: true, value: undefined };
      (this: any)[propName + "_binding"] = {
        descriptor: desc,
        object: this,
        key: propName,
      };
    }
  }

  static setupTrackedPropertyAccessors(propertyNames: Array<string>) {
    for (let propName of propertyNames) {
      Object.defineProperty(ObjectValue.prototype, propName, {
        configurable: true,
        get: function() {
          let binding = this[propName + "_binding"];
          return binding.descriptor.value;
        },
        set: function(v) {
          invariant(!this.isLeakedObject(), "cannot mutate a leaked object");
          let binding = this[propName + "_binding"];
          this.$Realm.recordModifiedProperty(binding);
          binding.descriptor.value = v;
        },
      });
    }
  }

  $Prototype: ObjectValue | NullValue;
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
  _isPartial: BooleanValue;

  // tainted objects
  _hasLeaked: AbstractValue | BooleanValue;

  // If true, the object has no property getters or setters and it is safe
  // to return AbstractValue for unknown properties.
  _isSimple: BooleanValue;

  // If true, it is not safe to perform any more mutations that would change
  // the object's serialized form.
  _isFinal: BooleanValue;

  isTemplate: void | true;

  properties: Map<string, PropertyBinding>;
  symbols: Map<SymbolValue, PropertyBinding>;
  unknownProperty: void | PropertyBinding;

  // An object value with an intrinsic name can either exist from the beginning of time,
  // or it can be associated with a particular point in time by being used as a template
  // when deriving an abstract value via a generator.
  intrinsicNameGenerated: void | true;
  hashValue: void | number;

  // ReactElement
  $BailOutReason: void | string;

  // ES2015 classes
  $IsClassPrototype: boolean;

  equals(x: Value): boolean {
    return x instanceof ObjectValue && this.getHash() === x.getHash();
  }

  getHash(): number {
    if (!this.hashValue) {
      this.hashValue = ++this.$Realm.objectCount;
    }
    return this.hashValue;
  }

  // We track some internal state as properties on the global object, these should
  // never be serialized.
  refuseSerialization: boolean;

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

  makeSimple(): void {
    this._isSimple = this.$Realm.intrinsics.true;
  }

  makeFinal(): void {
    this._isFinal = this.$Realm.intrinsics.true;
  }

  isPartialObject(): boolean {
    return this._isPartial.value;
  }

  isFinalObject(): boolean {
    return this._isFinal.value;
  }

  leak(): void {
    this._hasLeaked = this.$Realm.intrinsics.true;
  }

  isLeakedObject(): boolean {
    if (this._hasLeaked instanceof BooleanValue) {
      return this._hasLeaked.value;
    }
    if (this._hasLeaked === undefined) {
      return false;
    }
    return true;
  }

  isSimpleObject(): boolean {
    if (this._isSimple.value) return true;
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
    return this.$Prototype.isSimpleObject();
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

  defineNativeProperty(name: SymbolValue | string, value?: Value | Array<Value>, desc?: Descriptor = {}) {
    invariant(!value || value instanceof Value);
    this.$DefineOwnProperty(name, {
      value,
      writable: true,
      enumerable: false,
      configurable: true,
      ...desc,
    });
  }

  defineNativeGetter(name: SymbolValue | string, callback: NativeFunctionCallback, desc?: Descriptor = {}) {
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

  defineNativeConstant(name: SymbolValue | string, value?: Value | Array<Value>, desc?: Descriptor = {}) {
    invariant(!value || value instanceof Value);
    this.$DefineOwnProperty(name, {
      value,
      writable: false,
      enumerable: false,
      configurable: false,
      ...desc,
    });
  }

  getOwnPropertyKeysArray(): Array<string> {
    if (this.isPartialObject() || this.isLeakedObject() || this.unknownProperty !== undefined) {
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
      // For now just terminate.
      invariant(pv instanceof AbstractValue);
      AbstractValue.reportIntrospectionError(pv);
      throw new FatalError();
    });
    this.$Realm.callReportObjectGetOwnProperties(this);
    return keyArray;
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

  // ECMA262 9.1.1
  $GetPrototypeOf(): ObjectValue | NullValue {
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
      let propName;
      if (P instanceof StringValue) {
        propName = P;
      } else if (typeof P === "string") {
        propName = new StringValue(this.$Realm, P);
      } else {
        AbstractValue.reportIntrospectionError(val, "abstract computed property name");
        throw new FatalError();
      }
      return this.specializeJoin(val, propName);
    }

    // 1. Return ? OrdinaryGet(O, P, Receiver).
    return OrdinaryGet(this.$Realm, this, P, Receiver);
  }

  $GetPartial(P: AbstractValue | PropertyKeyValue, Receiver: Value): Value {
    if (Receiver instanceof AbstractValue && Receiver.getType() === StringValue && P === "length") {
      return AbstractValue.createFromTemplate(this.$Realm, lengthTemplate, NumberValue, [Receiver], lengthTemplateSrc);
    }

    if (!(P instanceof AbstractValue)) return this.$Get(P, Receiver);
    // We assume that simple objects have no getter/setter properties.
    if (
      this !== Receiver ||
      !this.isSimpleObject() ||
      (P.mightNotBeString() && P.mightNotBeNumber() && !P.isSimpleObject())
    ) {
      AbstractValue.reportIntrospectionError(P, "TODO: #1021");
      throw new FatalError();
    }
    // If all else fails, use this expression
    let result;
    if (this.isPartialObject()) {
      if (isWidenedValue(P)) {
        return AbstractValue.createTemporalFromBuildFunction(this.$Realm, Value, [this, P], ([o, p]) =>
          t.memberExpression(o, p, true)
        );
      }
      result = AbstractValue.createFromType(this.$Realm, Value, "sentinel member expression");
      result.args = [this, P];
    } else {
      result = this.$Realm.intrinsics.undefined;
    }
    // Get a specialization of the join of all values written to the object
    // with abstract property names.
    let prop = this.unknownProperty;
    if (prop !== undefined) {
      let desc = prop.descriptor;
      if (desc !== undefined) {
        let val = desc.value;
        invariant(val instanceof AbstractValue);
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
      result = Join.joinValuesAsConditional(this.$Realm, cond, val, result);
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
      return AbstractValue.createTemporalFromBuildFunction(this.$Realm, absVal.getType(), [ob, propName], ([o, p]) => {
        return t.memberExpression(o, p, true);
      });
    }
    invariant(absVal.args.length === 3 && absVal.kind === "conditional");
    let generic_cond = absVal.args[0];
    invariant(generic_cond instanceof AbstractValue);
    let cond = this.specializeCond(generic_cond, propName);
    let arg1 = absVal.args[1];
    if (arg1 instanceof AbstractValue && arg1.args.length === 3) arg1 = this.specializeJoin(arg1, propName);
    let arg2 = absVal.args[2];
    if (arg2 instanceof AbstractValue && arg2.args.length === 3) arg2 = this.specializeJoin(arg2, propName);
    return AbstractValue.createFromConditionalOp(this.$Realm, cond, arg1, arg2, absVal.expressionLocation);
  }

  specializeCond(absVal: AbstractValue, propName: Value): AbstractValue {
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

    // We assume that simple objects have no getter/setter properties and
    // that all properties are writable.
    if (
      this !== Receiver ||
      !this.isSimpleObject() ||
      (P.mightNotBeString() && P.mightNotBeNumber() && !P.isSimpleObject())
    ) {
      AbstractValue.reportIntrospectionError(P, "TODO #1021");
      throw new FatalError();
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
        // join V with undefined, using a property name test as the condition
        let cond = createTemplate(this.$Realm, P);
        newVal = Join.joinValuesAsConditional(this.$Realm, cond, V, this.$Realm.intrinsics.undefined);
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
          newVal = Join.joinValuesAsConditional(this.$Realm, cond, V, oldVal);
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
      let newVal = Join.joinValuesAsConditional(this.$Realm, cond, V, oldVal);
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
}
