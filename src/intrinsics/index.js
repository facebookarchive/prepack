/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow strict-local */

import { TypesDomain, ValuesDomain } from "../domains/index.js";
import type { Intrinsics } from "../types.js";
import type { Realm } from "../realm.js";
import {
  AbstractValue,
  BooleanValue,
  EmptyValue,
  NativeFunctionValue,
  NullValue,
  NumberValue,
  ObjectValue,
  StringValue,
  SymbolValue,
  UndefinedValue,
  Value,
} from "../values/index.js";
import { Functions } from "../singletons.js";

import initializeObject from "./ecma262/Object.js";
import initializeObjectPrototype from "./ecma262/ObjectPrototype.js";

import initializeError from "./ecma262/Error.js";
import initializeErrorPrototype from "./ecma262/ErrorPrototype.js";

import initializeTypeError from "./ecma262/TypeError.js";
import initializeTypeErrorPrototype from "./ecma262/TypeErrorPrototype.js";

import initializeRangeError from "./ecma262/RangeError.js";
import initializeRangeErrorPrototype from "./ecma262/RangeErrorPrototype.js";

import initializeReferenceError from "./ecma262/ReferenceError.js";
import initializeReferenceErrorPrototype from "./ecma262/ReferenceErrorPrototype.js";

import initializeSyntaxError from "./ecma262/SyntaxError.js";
import initializeSyntaxErrorPrototype from "./ecma262/SyntaxErrorPrototype.js";

import initializeURIError from "./ecma262/URIError.js";
import initializeURIErrorPrototype from "./ecma262/URIErrorPrototype.js";

import initializeEvalError from "./ecma262/EvalError.js";
import initializeEvalErrorPrototype from "./ecma262/EvalErrorPrototype.js";

import initializeFunction from "./ecma262/Function.js";
import initializeFunctionPrototype from "./ecma262/FunctionPrototype.js";

import initializeGenerator from "./ecma262/Generator.js";
import initializeGeneratorFunction from "./ecma262/GeneratorFunction.js";
import initializeGeneratorPrototype from "./ecma262/GeneratorPrototype.js";

import initializeArray from "./ecma262/Array.js";
import initializeArrayPrototype from "./ecma262/ArrayPrototype.js";

import initializeDate from "./ecma262/Date.js";
import initializeDatePrototype from "./ecma262/DatePrototype.js";

import initializeRegExp from "./ecma262/RegExp.js";
import initializeRegExpPrototype from "./ecma262/RegExpPrototype.js";

import initializeSymbol from "./ecma262/Symbol.js";
import initializeSymbolPrototype from "./ecma262/SymbolPrototype.js";

import initializeString from "./ecma262/String.js";
import initializeStringPrototype from "./ecma262/StringPrototype.js";

import initializeNumber from "./ecma262/Number.js";
import initializeNumberPrototype from "./ecma262/NumberPrototype.js";

import initializeBoolean from "./ecma262/Boolean.js";
import initializeBooleanPrototype from "./ecma262/BooleanPrototype.js";

import initializeDataView from "./ecma262/DataView.js";
import initializeDataViewPrototype from "./ecma262/DataViewPrototype.js";

import initializeTypedArray from "./ecma262/TypedArray.js";
import initializeTypedArrayPrototype from "./ecma262/TypedArrayPrototype.js";

import initializeFloat32Array from "./ecma262/Float32Array.js";
import initializeFloat32ArrayPrototype from "./ecma262/Float32ArrayPrototype.js";

import initializeFloat64Array from "./ecma262/Float64Array.js";
import initializeFloat64ArrayPrototype from "./ecma262/Float64ArrayPrototype.js";

import initializeInt8Array from "./ecma262/Int8Array.js";
import initializeInt8ArrayPrototype from "./ecma262/Int8ArrayPrototype.js";

import initializeInt16Array from "./ecma262/Int16Array.js";
import initializeInt16ArrayPrototype from "./ecma262/Int16ArrayPrototype.js";

import initializeInt32Array from "./ecma262/Int32Array.js";
import initializeInt32ArrayPrototype from "./ecma262/Int32ArrayPrototype.js";

import initializeMap from "./ecma262/Map.js";
import initializeMapPrototype from "./ecma262/MapPrototype.js";

import initializeWeakMap from "./ecma262/WeakMap.js";
import initializeWeakMapPrototype from "./ecma262/WeakMapPrototype.js";

import initializeSet from "./ecma262/Set.js";
import initializeSetPrototype from "./ecma262/SetPrototype.js";

import initializePromise from "./ecma262/Promise.js";
import initializePromisePrototype from "./ecma262/PromisePrototype.js";

import initializeUint8Array from "./ecma262/Uint8Array.js";
import initializeUint8ArrayPrototype from "./ecma262/Uint8ArrayPrototype.js";

import initializeUint8ClampedArray from "./ecma262/Uint8ClampedArray.js";
import initializeUint8ClampedArrayPrototype from "./ecma262/Uint8ClampedArrayPrototype.js";

import initializeUint16Array from "./ecma262/Uint16Array.js";
import initializeUint16ArrayPrototype from "./ecma262/Uint16ArrayPrototype.js";

import initializeUint32Array from "./ecma262/Uint32Array.js";
import initializeUint32ArrayPrototype from "./ecma262/Uint32ArrayPrototype.js";

import initializeWeakSet from "./ecma262/WeakSet.js";
import initializeWeakSetPrototype from "./ecma262/WeakSetPrototype.js";

import initializeArrayBuffer from "./ecma262/ArrayBuffer.js";
import initializeArrayBufferPrototype from "./ecma262/ArrayBufferPrototype.js";

import initializeJSON from "./ecma262/JSON.js";
import initializeReflect from "./ecma262/Reflect.js";
import initializeMath from "./ecma262/Math.js";

import initializeProxy from "./ecma262/Proxy.js";

import initializeParseInt from "./ecma262/parseInt.js";
import initializeParseFloat from "./ecma262/parseFloat.js";
import initializeIsFinite from "./ecma262/isFinite.js";
import initializeDecodeURI from "./ecma262/decodeURI.js";
import initializeDecodeURIComponent from "./ecma262/decodeURIComponent.js";
import initializeEncodeURI from "./ecma262/encodeURI.js";
import initializeEncodeURIComponent from "./ecma262/encodeURIComponent.js";
import initializeEval from "./ecma262/eval.js";
import initializeIsNaN from "./ecma262/isNaN.js";

import initializeArrayIteratorPrototype from "./ecma262/ArrayIteratorPrototype.js";
import initializeStringIteratorPrototype from "./ecma262/StringIteratorPrototype.js";
import initializeMapIteratorPrototype from "./ecma262/MapIteratorPrototype.js";
import initializeSetIteratorPrototype from "./ecma262/SetIteratorPrototype.js";
import initializeIteratorPrototype from "./ecma262/IteratorPrototype.js";
import initializeArrayProto_values from "./ecma262/ArrayProto_values.js";
import initializeArrayProto_toString from "./ecma262/ArrayProto_toString.js";
import initializeObjectProto_toString from "./ecma262/ObjectProto_toString.js";
import initializeTypedArrayProto_values from "./ecma262/TypedArrayProto_values.js";
import initializeThrowTypeError from "./ecma262/ThrowTypeError.js";

import initialize__IntrospectionError from "./prepack/__IntrospectionError.js";
import initialize__IntrospectionErrorPrototype from "./prepack/__IntrospectionErrorPrototype.js";
import { PropertyDescriptor } from "../descriptors.js";

export function initialize(i: Intrinsics, realm: Realm): Intrinsics {
  i.undefined = new UndefinedValue(realm);
  i.empty = new EmptyValue(realm);
  i.null = new NullValue(realm);
  i.false = new BooleanValue(realm, false);
  i.true = new BooleanValue(realm, true);
  i.NaN = new NumberValue(realm, NaN);
  i.negativeInfinity = new NumberValue(realm, -Infinity);
  i.Infinity = new NumberValue(realm, +Infinity);
  i.negativeZero = new NumberValue(realm, -0);
  i.zero = new NumberValue(realm, +0);
  i.emptyString = new StringValue(realm, "");

  //
  i.ObjectPrototype = new ObjectValue(realm, i.ObjectPrototype, "Object.prototype");
  i.FunctionPrototype = i.ObjectPrototype;
  i.FunctionPrototype = new NativeFunctionValue(realm, "Function.prototype", "", 0, context => i.undefined, false);

  i.parseFloat = initializeParseFloat(realm);
  i.parseInt = initializeParseInt(realm);

  i.SymbolPrototype = new ObjectValue(realm, i.ObjectPrototype, "Symbol.prototype");

  // initialize common symbols
  i.SymbolIsConcatSpreadable = new SymbolValue(
    realm,
    new StringValue(realm, "Symbol.isConcatSpreadable"),
    "Symbol.isConcatSpreadable"
  );
  i.SymbolSpecies = new SymbolValue(realm, new StringValue(realm, "Symbol.species"), "Symbol.species");
  i.SymbolReplace = new SymbolValue(realm, new StringValue(realm, "Symbol.replace"), "Symbol.replace");
  i.SymbolIterator = new SymbolValue(realm, new StringValue(realm, "Symbol.iterator"), "Symbol.iterator");
  i.SymbolHasInstance = new SymbolValue(realm, new StringValue(realm, "Symbol.hasInstance"), "Symbol.hasInstance");
  i.SymbolToPrimitive = new SymbolValue(realm, new StringValue(realm, "Symbol.toPrimitive"), "Symbol.toPrimitive");
  i.SymbolToStringTag = new SymbolValue(realm, new StringValue(realm, "Symbol.toStringTag"), "Symbol.toStringTag");
  i.SymbolMatch = new SymbolValue(realm, new StringValue(realm, "Symbol.match"), "Symbol.match");
  i.SymbolSplit = new SymbolValue(realm, new StringValue(realm, "Symbol.split"), "Symbol.split");
  i.SymbolSearch = new SymbolValue(realm, new StringValue(realm, "Symbol.search"), "Symbol.search");
  i.SymbolUnscopables = new SymbolValue(realm, new StringValue(realm, "Symbol.unscopables"), "Symbol.unscopables");

  //
  i.ArrayProto_values = initializeArrayProto_values(realm);
  i.ArrayProto_toString = initializeArrayProto_toString(realm);

  //
  i.ObjectProto_toString = initializeObjectProto_toString(realm);

  //
  if (!realm.isCompatibleWith(realm.MOBILE_JSC_VERSION) && !realm.isCompatibleWith("mobile"))
    i.TypedArrayProto_values = initializeTypedArrayProto_values(realm);

  //
  i.ArrayPrototype = new ObjectValue(realm, i.ObjectPrototype, "Array.prototype");
  i.RegExpPrototype = new ObjectValue(realm, i.ObjectPrototype, "RegExp.prototype");
  i.DatePrototype = new ObjectValue(realm, i.ObjectPrototype, "Date.prototype");
  i.StringPrototype = new ObjectValue(realm, i.ObjectPrototype, "String.prototype");
  i.BooleanPrototype = new ObjectValue(realm, i.ObjectPrototype, "Boolean.prototype");
  i.NumberPrototype = new ObjectValue(realm, i.ObjectPrototype, "Number.prototype");
  i.DataViewPrototype = new ObjectValue(realm, i.ObjectPrototype, "DataView.prototype");
  i.PromisePrototype = new ObjectValue(realm, i.ObjectPrototype, "Promise.prototype");
  i.ArrayBufferPrototype = new ObjectValue(realm, i.ObjectPrototype, "ArrayBuffer.prototype");

  // error prototypes
  i.ErrorPrototype = new ObjectValue(realm, i.ObjectPrototype, "Error.prototype");
  i.RangeErrorPrototype = new ObjectValue(realm, i.ErrorPrototype, "RangeError.prototype");
  i.TypeErrorPrototype = new ObjectValue(realm, i.ErrorPrototype, "TypeError.prototype");
  i.ReferenceErrorPrototype = new ObjectValue(realm, i.ErrorPrototype, "ReferenceError.prototype");
  i.URIErrorPrototype = new ObjectValue(realm, i.ErrorPrototype, "URIError.prototype");
  i.EvalErrorPrototype = new ObjectValue(realm, i.ErrorPrototype, "EvalError.prototype");
  i.SyntaxErrorPrototype = new ObjectValue(realm, i.ErrorPrototype, "SyntaxError.prototype");
  i.__IntrospectionErrorPrototype = new ObjectValue(realm, i.ErrorPrototype, "__IntrospectionError.prototype");

  // collection prototypes
  i.MapPrototype = new ObjectValue(realm, i.ObjectPrototype, "Map.prototype");
  i.SetPrototype = new ObjectValue(realm, i.ObjectPrototype, "Set.prototype");
  i.WeakMapPrototype = new ObjectValue(realm, i.ObjectPrototype, "WeakMap.prototype");
  if (!realm.isCompatibleWith(realm.MOBILE_JSC_VERSION) && !realm.isCompatibleWith("mobile")) {
    i.WeakSetPrototype = new ObjectValue(realm, i.ObjectPrototype, "WeakSet.prototype");
  }

  // typed array prototypes
  if (!realm.isCompatibleWith(realm.MOBILE_JSC_VERSION) && !realm.isCompatibleWith("mobile"))
    i.TypedArrayPrototype = new ObjectValue(
      realm,
      i.ObjectPrototype,
      "TypedArray.prototype",
      /* refuseSerialization */ true
    );
  i.Float32ArrayPrototype = new ObjectValue(realm, i.ObjectPrototype, "Float32Array.prototype");
  i.Float64ArrayPrototype = new ObjectValue(realm, i.ObjectPrototype, "Float64Array.prototype");
  i.Int8ArrayPrototype = new ObjectValue(realm, i.ObjectPrototype, "Int8Array.prototype");
  i.Int16ArrayPrototype = new ObjectValue(realm, i.ObjectPrototype, "Int16Array.prototype");
  i.Int32ArrayPrototype = new ObjectValue(realm, i.ObjectPrototype, "Int32Array.prototype");
  i.Uint8ArrayPrototype = new ObjectValue(realm, i.ObjectPrototype, "Uint8Array.prototype");
  i.Uint8ClampedArrayPrototype = new ObjectValue(realm, i.ObjectPrototype, "Uint8ClampedArray.prototype");
  i.Uint16ArrayPrototype = new ObjectValue(realm, i.ObjectPrototype, "Uint16Array.prototype");
  i.Uint32ArrayPrototype = new ObjectValue(realm, i.ObjectPrototype, "Uint32Array.prototype");

  // iterator prototypes
  i.IteratorPrototype = new ObjectValue(realm, i.ObjectPrototype, "([][Symbol.iterator]().__proto__.__proto__)");
  i.MapIteratorPrototype = new ObjectValue(realm, i.IteratorPrototype, "(new Map()[Symbol.iterator]().__proto__)");
  i.SetIteratorPrototype = new ObjectValue(realm, i.IteratorPrototype, "(new Set()[Symbol.iterator]().__proto__)");
  i.ArrayIteratorPrototype = new ObjectValue(realm, i.IteratorPrototype, "([][Symbol.iterator]().__proto__)");
  i.StringIteratorPrototype = new ObjectValue(realm, i.IteratorPrototype, '(""[Symbol.iterator]().__proto__)');

  //
  initializeObjectPrototype(realm, i.ObjectPrototype);
  initializeFunctionPrototype(realm, i.FunctionPrototype);
  initializeArrayPrototype(realm, i.ArrayPrototype);
  initializeDatePrototype(realm, i.DatePrototype);
  initializeRegExpPrototype(realm, i.RegExpPrototype);
  initializeStringPrototype(realm, i.StringPrototype);
  initializeBooleanPrototype(realm, i.BooleanPrototype);
  initializeNumberPrototype(realm, i.NumberPrototype);
  initializeSymbolPrototype(realm, i.SymbolPrototype);
  initializeErrorPrototype(realm, i.ErrorPrototype);
  initializeTypeErrorPrototype(realm, i.TypeErrorPrototype);
  initializeRangeErrorPrototype(realm, i.RangeErrorPrototype);
  initializeReferenceErrorPrototype(realm, i.ReferenceErrorPrototype);
  initializeURIErrorPrototype(realm, i.URIErrorPrototype);
  initializeEvalErrorPrototype(realm, i.EvalErrorPrototype);
  initializeSyntaxErrorPrototype(realm, i.SyntaxErrorPrototype);
  initialize__IntrospectionErrorPrototype(realm, i.__IntrospectionErrorPrototype);
  initializeDataViewPrototype(realm, i.DataViewPrototype);
  initializeWeakMapPrototype(realm, i.WeakMapPrototype);
  if (!realm.isCompatibleWith(realm.MOBILE_JSC_VERSION) && !realm.isCompatibleWith("mobile")) {
    initializeTypedArrayPrototype(realm, i.TypedArrayPrototype);
    initializeWeakSetPrototype(realm, i.WeakSetPrototype);
  }
  initializeFloat32ArrayPrototype(realm, i.Float32ArrayPrototype);
  initializeFloat64ArrayPrototype(realm, i.Float64ArrayPrototype);
  initializeInt8ArrayPrototype(realm, i.Int8ArrayPrototype);
  initializeInt16ArrayPrototype(realm, i.Int16ArrayPrototype);
  initializeInt32ArrayPrototype(realm, i.Int32ArrayPrototype);
  initializeMapPrototype(realm, i.MapPrototype);
  initializeSetPrototype(realm, i.SetPrototype);
  initializePromisePrototype(realm, i.PromisePrototype);
  initializeUint8ArrayPrototype(realm, i.Uint8ArrayPrototype);
  initializeUint8ClampedArrayPrototype(realm, i.Uint8ClampedArrayPrototype);
  initializeUint16ArrayPrototype(realm, i.Uint16ArrayPrototype);
  initializeUint32ArrayPrototype(realm, i.Uint32ArrayPrototype);
  initializeArrayBufferPrototype(realm, i.ArrayBufferPrototype);

  // iterator prototypes
  initializeIteratorPrototype(realm, i.IteratorPrototype);
  initializeArrayIteratorPrototype(realm, i.ArrayIteratorPrototype);
  initializeStringIteratorPrototype(realm, i.StringIteratorPrototype);
  initializeMapIteratorPrototype(realm, i.MapIteratorPrototype);
  initializeSetIteratorPrototype(realm, i.SetIteratorPrototype);

  //
  i.Object = initializeObject(realm);
  i.Function = initializeFunction(realm);
  i.Array = initializeArray(realm);
  i.RegExp = initializeRegExp(realm);
  i.Date = initializeDate(realm);
  i.String = initializeString(realm);
  i.Math = initializeMath(realm);
  i.Boolean = initializeBoolean(realm);
  i.Number = initializeNumber(realm);
  i.Symbol = initializeSymbol(realm);
  i.JSON = initializeJSON(realm);
  i.Proxy = initializeProxy(realm);
  if (!realm.isCompatibleWith(realm.MOBILE_JSC_VERSION) && !realm.isCompatibleWith("mobile"))
    i.Reflect = initializeReflect(realm);
  i.Promise = initializePromise(realm);
  i.DataView = initializeDataView(realm);

  // collections
  i.Set = initializeSet(realm);
  i.Map = initializeMap(realm);
  i.WeakMap = initializeWeakMap(realm);
  if (!realm.isCompatibleWith(realm.MOBILE_JSC_VERSION) && !realm.isCompatibleWith("mobile")) {
    i.WeakSet = initializeWeakSet(realm);
  }
  i.ArrayBuffer = initializeArrayBuffer(realm);

  // typed arrays
  if (!realm.isCompatibleWith(realm.MOBILE_JSC_VERSION) && !realm.isCompatibleWith("mobile"))
    i.TypedArray = initializeTypedArray(realm);
  i.Float32Array = initializeFloat32Array(realm);
  i.Float64Array = initializeFloat64Array(realm);
  i.Int8Array = initializeInt8Array(realm);
  i.Int16Array = initializeInt16Array(realm);
  i.Int32Array = initializeInt32Array(realm);
  i.Uint8Array = initializeUint8Array(realm);
  i.Uint8ClampedArray = initializeUint8ClampedArray(realm);
  i.Uint16Array = initializeUint16Array(realm);
  i.Uint32Array = initializeUint32Array(realm);

  //
  i.Error = initializeError(realm);
  i.TypeError = initializeTypeError(realm);
  i.RangeError = initializeRangeError(realm);
  i.ReferenceError = initializeReferenceError(realm);
  i.URIError = initializeURIError(realm);
  i.EvalError = initializeEvalError(realm);
  i.SyntaxError = initializeSyntaxError(realm);
  i.__IntrospectionError = initialize__IntrospectionError(realm);

  //
  let builtins = [
    "Object",
    "Function",
    "Symbol",
    "String",
    "Array",
    "Boolean",
    "RegExp",
    "Date",
    "Error",
    "Number",
    "TypeError",
    "RangeError",
    "ReferenceError",
    "SyntaxError",
    "URIError",
    "EvalError",
    "DataView",
    "Float32Array",
    "Float64Array",
    "Int8Array",
    "Int16Array",
    "Int32Array",
    "Map",
    "Set",
    "WeakMap",
    "Promise",
    "Uint8Array",
    "Uint8ClampedArray",
    "Uint16Array",
    "Uint32Array",
    "ArrayBuffer",
  ];
  if (!realm.isCompatibleWith(realm.MOBILE_JSC_VERSION) && !realm.isCompatibleWith("mobile")) {
    builtins = builtins.concat(["WeakSet", "TypedArray"]);
  }

  for (let name of builtins) {
    let fn = i[name];
    let proto = i[`${name}Prototype`];

    proto.$DefineOwnProperty(
      "constructor",
      new PropertyDescriptor({
        value: fn,
        writable: true,
        enumerable: false,
        configurable: true,
      })
    );

    fn.$DefineOwnProperty(
      "prototype",
      new PropertyDescriptor({
        value: proto,
        writable: false,
        enumerable: false,
        configurable: false,
      })
    );

    fn.$DefineOwnProperty(
      "constructor",
      new PropertyDescriptor({
        value: i.Function,
        writable: true,
        enumerable: false,
        configurable: true,
      })
    );
  }

  //
  i.GeneratorPrototype = new ObjectValue(realm, i.FunctionPrototype, "Generator.prototype");
  initializeGeneratorPrototype(realm, i.GeneratorPrototype);
  i.Generator = new ObjectValue(realm, i.FunctionPrototype, "Generator");
  initializeGenerator(realm, i.Generator);
  i.GeneratorFunction = initializeGeneratorFunction(realm);

  i.Generator.$DefineOwnProperty(
    "prototype",
    new PropertyDescriptor({
      value: i.GeneratorPrototype,
      writable: false,
      enumerable: false,
      configurable: true,
    })
  );
  i.GeneratorPrototype.$DefineOwnProperty(
    "constructor",
    new PropertyDescriptor({
      value: i.Generator,
      writable: false,
      enumerable: false,
      configurable: true,
    })
  );

  i.GeneratorFunction.$DefineOwnProperty(
    "prototype",
    new PropertyDescriptor({
      value: i.Generator,
      writable: false,
      enumerable: false,
      configurable: false,
    })
  );
  i.Generator.$DefineOwnProperty(
    "constructor",
    new PropertyDescriptor({
      value: i.GeneratorFunction,
      writable: false,
      enumerable: false,
      configurable: true,
    })
  );

  //
  i.isNaN = initializeIsNaN(realm);
  i.isFinite = initializeIsFinite(realm);
  i.decodeURI = initializeDecodeURI(realm);
  i.decodeURIComponent = initializeDecodeURIComponent(realm);
  i.encodeURI = initializeEncodeURI(realm);
  i.encodeURIComponent = initializeEncodeURIComponent(realm);
  i.ThrowTypeError = initializeThrowTypeError(realm);
  i.eval = initializeEval(realm);

  // 8.2.2, step 12
  Functions.AddRestrictedFunctionProperties(i.FunctionPrototype, realm);

  //
  if (realm.useAbstractInterpretation) {
    TypesDomain.topVal = new TypesDomain(undefined);
    ValuesDomain.topVal = new ValuesDomain(undefined);
    i.__topValue = new AbstractValue(realm, TypesDomain.topVal, ValuesDomain.topVal, Number.MAX_SAFE_INTEGER, []);
    TypesDomain.bottomVal = new TypesDomain(EmptyValue);
    ValuesDomain.bottomVal = new ValuesDomain(new Set());
    i.__bottomValue = new AbstractValue(
      realm,
      TypesDomain.bottomVal,
      ValuesDomain.bottomVal,
      Number.MIN_SAFE_INTEGER,
      []
    );
    i.__leakedValue = AbstractValue.createFromType(realm, Value, "leaked binding value", []);
  }

  return i;
}
