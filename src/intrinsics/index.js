/**
 * Copyright (c) 2017-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 */

/* @flow */

import type { Intrinsics } from "../types.js";
import type { Realm } from "../realm.js";
import { NumberValue, StringValue, NullValue, UndefinedValue, EmptyValue, ObjectValue, SymbolValue, BooleanValue, NativeFunctionValue } from "../values/index.js";
import { AddRestrictedFunctionProperties } from "../methods/function.js";

import initialiseObject from "./ecma262/Object.js";
import initialiseObjectPrototype from "./ecma262/ObjectPrototype.js";

import initialiseError from "./ecma262/Error.js";
import initialiseErrorPrototype from "./ecma262/ErrorPrototype.js";

import initialiseTypeError from "./ecma262/TypeError.js";
import initialiseTypeErrorPrototype from "./ecma262/TypeErrorPrototype.js";

import initialiseRangeError from "./ecma262/RangeError.js";
import initialiseRangeErrorPrototype from "./ecma262/RangeErrorPrototype.js";

import initialiseReferenceError from "./ecma262/ReferenceError.js";
import initialiseReferenceErrorPrototype from "./ecma262/ReferenceErrorPrototype.js";

import initialiseSyntaxError from "./ecma262/SyntaxError.js";
import initialiseSyntaxErrorPrototype from "./ecma262/SyntaxErrorPrototype.js";

import initialiseURIError from "./ecma262/URIError.js";
import initialiseURIErrorPrototype from "./ecma262/URIErrorPrototype.js";

import initialiseEvalError from "./ecma262/EvalError.js";
import initialiseEvalErrorPrototype from "./ecma262/EvalErrorPrototype.js";

import initialiseFunction from "./ecma262/Function.js";
import initialiseFunctionPrototype from "./ecma262/FunctionPrototype.js";

import initialiseGenerator from "./ecma262/Generator.js";
import initialiseGeneratorFunction from "./ecma262/GeneratorFunction.js";
import initialiseGeneratorPrototype from "./ecma262/GeneratorPrototype.js";

import initialiseArray from "./ecma262/Array.js";
import initialiseArrayPrototype from "./ecma262/ArrayPrototype.js";

import initialiseDate from "./ecma262/Date.js";
import initialiseDatePrototype from "./ecma262/DatePrototype.js";

import initialiseRegExp from "./ecma262/RegExp.js";
import initialiseRegExpPrototype from "./ecma262/RegExpPrototype.js";

import initialiseSymbol from "./ecma262/Symbol.js";
import initialiseSymbolPrototype from "./ecma262/SymbolPrototype.js";

import initialiseString from "./ecma262/String.js";
import initialiseStringPrototype from "./ecma262/StringPrototype.js";

import initialiseNumber from "./ecma262/Number.js";
import initialiseNumberPrototype from "./ecma262/NumberPrototype.js";

import initialiseBoolean from "./ecma262/Boolean.js";
import initialiseBooleanPrototype from "./ecma262/BooleanPrototype.js";

import initialiseDataView from "./ecma262/DataView.js";
import initialiseDataViewPrototype from "./ecma262/DataViewPrototype.js";

import initialiseTypedArray from "./ecma262/TypedArray.js";
import initialiseTypedArrayPrototype from "./ecma262/TypedArrayPrototype.js";

import initialiseFloat32Array from "./ecma262/Float32Array.js";
import initialiseFloat32ArrayPrototype from "./ecma262/Float32ArrayPrototype.js";

import initialiseFloat64Array from "./ecma262/Float64Array.js";
import initialiseFloat64ArrayPrototype from "./ecma262/Float64ArrayPrototype.js";

import initialiseInt8Array from "./ecma262/Int8Array.js";
import initialiseInt8ArrayPrototype from "./ecma262/Int8ArrayPrototype.js";

import initialiseInt16Array from "./ecma262/Int16Array.js";
import initialiseInt16ArrayPrototype from "./ecma262/Int16ArrayPrototype.js";

import initialiseInt32Array from "./ecma262/Int32Array.js";
import initialiseInt32ArrayPrototype from "./ecma262/Int32ArrayPrototype.js";

import initialiseMap from "./ecma262/Map.js";
import initialiseMapPrototype from "./ecma262/MapPrototype.js";

import initialiseWeakMap from "./ecma262/WeakMap.js";
import initialiseWeakMapPrototype from "./ecma262/WeakMapPrototype.js";

import initialiseSet from "./ecma262/Set.js";
import initialiseSetPrototype from "./ecma262/SetPrototype.js";

import initialisePromise from "./ecma262/Promise.js";
import initialisePromisePrototype from "./ecma262/PromisePrototype.js";

import initialiseUint8Array from "./ecma262/Uint8Array.js";
import initialiseUint8ArrayPrototype from "./ecma262/Uint8ArrayPrototype.js";

import initialiseUint8ClampedArray from "./ecma262/Uint8ClampedArray.js";
import initialiseUint8ClampedArrayPrototype from "./ecma262/Uint8ClampedArrayPrototype.js";

import initialiseUint16Array from "./ecma262/Uint16Array.js";
import initialiseUint16ArrayPrototype from "./ecma262/Uint16ArrayPrototype.js";

import initialiseUint32Array from "./ecma262/Uint32Array.js";
import initialiseUint32ArrayPrototype from "./ecma262/Uint32ArrayPrototype.js";

import initialiseWeakSet from "./ecma262/WeakSet.js";
import initialiseWeakSetPrototype from "./ecma262/WeakSetPrototype.js";

import initialiseArrayBuffer from "./ecma262/ArrayBuffer.js";
import initialiseArrayBufferPrototype from "./ecma262/ArrayBufferPrototype.js";

import initialiseJSON from "./ecma262/JSON.js";
import initialiseReflect from "./ecma262/Reflect.js";
import initialiseMath from "./ecma262/Math.js";
import initialiseConsole from "./ecma262/console.js";

import initialiseProxy from "./ecma262/Proxy.js";

import initialiseParseInt from "./ecma262/parseInt.js";
import initialiseParseFloat from "./ecma262/parseFloat.js";
import initialiseIsFinite from "./ecma262/isFinite.js";
import initialiseDecodeURI from "./ecma262/decodeURI.js";
import initialiseDecodeURIComponent from "./ecma262/decodeURIComponent.js";
import initialiseEncodeURI from "./ecma262/encodeURI.js";
import initialiseEncodeURIComponent from "./ecma262/encodeURIComponent.js";
import initialiseEval from "./ecma262/eval.js";
import initialiseIsNaN from "./ecma262/isNaN.js";

import initialiseArrayIteratorPrototype from "./ecma262/ArrayIteratorPrototype.js";
import initialiseStringIteratorPrototype from "./ecma262/StringIteratorPrototype.js";
import initialiseMapIteratorPrototype from "./ecma262/MapIteratorPrototype.js";
import initialiseSetIteratorPrototype from "./ecma262/SetIteratorPrototype.js";
import initialiseIteratorPrototype from "./ecma262/IteratorPrototype.js";
import initialiseArrayProto_values from "./ecma262/ArrayProto_values.js";
import initialiseArrayProto_toString from "./ecma262/ArrayProto_toString.js";
import initialiseObjectProto_toString from "./ecma262/ObjectProto_toString.js";
import initialiseTypedArrayProto_values from "./ecma262/TypedArrayProto_values.js";
import initialiseThrowTypeError from "./ecma262/ThrowTypeError.js";

import initialiseDocument from "./dom/document.js";
import initialise__IntrospectionError from "./__IntrospectionError.js";
import initialise__IntrospectionErrorPrototype from "./__IntrospectionErrorPrototype.js";
import initialise__ReadOnlyError from "./__ReadOnlyError.js";
import initialise__ReadOnlyErrorPrototype from "./__ReadOnlyErrorPrototype.js";


export function initialise(i: Intrinsics, realm: Realm): Intrinsics {
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
  i.FunctionPrototype = new NativeFunctionValue(realm, "Function.prototype", "",
    0, (context) => i.undefined, false);

  i.parseFloat = initialiseParseFloat(realm);
  i.parseInt = initialiseParseInt(realm);

  i.SymbolPrototype = new ObjectValue(realm, i.ObjectPrototype, "Symbol.prototype");

  // initialise common symbols
  i.SymbolIsConcatSpreadable = new SymbolValue(realm, "Symbol.isConcatSpreadable");
  i.SymbolSpecies = new SymbolValue(realm, "Symbol.species");
  i.SymbolReplace = new SymbolValue(realm, "Symbol.replace");
  i.SymbolIterator = new SymbolValue(realm, "Symbol.iterator");
  i.SymbolHasInstance = new SymbolValue(realm, "Symbol.hasInstance");
  i.SymbolToPrimitive = new SymbolValue(realm, "Symbol.toPrimitive");
  i.SymbolToStringTag = new SymbolValue(realm, "Symbol.toStringTag");
  i.SymbolMatch = new SymbolValue(realm, "Symbol.match");
  i.SymbolSplit = new SymbolValue(realm, "Symbol.split");
  i.SymbolSearch = new SymbolValue(realm, "Symbol.search");
  i.SymbolUnscopables = new SymbolValue(realm, "Symbol.unscopables");

  //
  i.ArrayProto_values = initialiseArrayProto_values(realm);
  i.ArrayProto_toString = initialiseArrayProto_toString(realm);

  //
  i.ObjectProto_toString = initialiseObjectProto_toString(realm);

  //
  if (realm.compatibility !== 'jsc')
  i.TypedArrayProto_values = initialiseTypedArrayProto_values(realm);

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
  i.__ReadOnlyErrorPrototype = new ObjectValue(realm, i.ErrorPrototype, "__ReadOnlyError.prototype");

  // collection prototypes
  i.MapPrototype = new ObjectValue(realm, i.ObjectPrototype, "Map.prototype");
  if (realm.compatibility !== 'jsc') {
    i.WeakSetPrototype = new ObjectValue(realm, i.ObjectPrototype, "WeakSet.prototype");
    i.WeakMapPrototype = new ObjectValue(realm, i.ObjectPrototype, "WeakMap.prototype");
  }
  i.SetPrototype = new ObjectValue(realm, i.ObjectPrototype, "Set.prototype");

  // typed array prototypes
  if (realm.compatibility !== 'jsc')
  i.TypedArrayPrototype = new ObjectValue(realm, i.ObjectPrototype, "TypedArray.prototype");
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
  i.IteratorPrototype = new ObjectValue(realm, i.ObjectPrototype, "IteratorPrototype");
  i.MapIteratorPrototype = new ObjectValue(realm, i.IteratorPrototype, "MapIteratorPrototype");
  i.SetIteratorPrototype = new ObjectValue(realm, i.IteratorPrototype, "SetIteratorPrototype");
  i.ArrayIteratorPrototype = new ObjectValue(realm, i.IteratorPrototype, "ArrayIteratorPrototype");
  i.StringIteratorPrototype = new ObjectValue(realm, i.IteratorPrototype, "StringIteratorPrototype");

  //
  initialiseObjectPrototype(realm, i.ObjectPrototype);
  initialiseFunctionPrototype(realm, i.FunctionPrototype);
  initialiseArrayPrototype(realm, i.ArrayPrototype);
  initialiseDatePrototype(realm, i.DatePrototype);
  initialiseRegExpPrototype(realm, i.RegExpPrototype);
  initialiseStringPrototype(realm, i.StringPrototype);
  initialiseBooleanPrototype(realm, i.BooleanPrototype);
  initialiseNumberPrototype(realm, i.NumberPrototype);
  initialiseSymbolPrototype(realm, i.SymbolPrototype);
  initialiseErrorPrototype(realm, i.ErrorPrototype);
  initialiseTypeErrorPrototype(realm, i.TypeErrorPrototype);
  initialiseRangeErrorPrototype(realm, i.RangeErrorPrototype);
  initialiseReferenceErrorPrototype(realm, i.ReferenceErrorPrototype);
  initialiseURIErrorPrototype(realm, i.URIErrorPrototype);
  initialiseEvalErrorPrototype(realm, i.EvalErrorPrototype);
  initialiseSyntaxErrorPrototype(realm, i.SyntaxErrorPrototype);
  initialise__IntrospectionErrorPrototype(realm, i.__IntrospectionErrorPrototype);
  initialise__ReadOnlyErrorPrototype(realm, i.__ReadOnlyErrorPrototype);
  initialiseDataViewPrototype(realm, i.DataViewPrototype);
  if (realm.compatibility !== 'jsc') {
    initialiseTypedArrayPrototype(realm, i.TypedArrayPrototype);
    initialiseWeakSetPrototype(realm, i.WeakSetPrototype);
    initialiseWeakMapPrototype(realm, i.WeakMapPrototype);
  }
  initialiseFloat32ArrayPrototype(realm, i.Float32ArrayPrototype);
  initialiseFloat64ArrayPrototype(realm, i.Float64ArrayPrototype);
  initialiseInt8ArrayPrototype(realm, i.Int8ArrayPrototype);
  initialiseInt16ArrayPrototype(realm, i.Int16ArrayPrototype);
  initialiseInt32ArrayPrototype(realm, i.Int32ArrayPrototype);
  initialiseMapPrototype(realm, i.MapPrototype);
  initialiseSetPrototype(realm, i.SetPrototype);
  initialisePromisePrototype(realm, i.PromisePrototype);
  initialiseUint8ArrayPrototype(realm, i.Uint8ArrayPrototype);
  initialiseUint8ClampedArrayPrototype(realm, i.Uint8ClampedArrayPrototype);
  initialiseUint16ArrayPrototype(realm, i.Uint16ArrayPrototype);
  initialiseUint32ArrayPrototype(realm, i.Uint32ArrayPrototype);
  initialiseArrayBufferPrototype(realm, i.ArrayBufferPrototype);

  // iterator prototypes
  initialiseIteratorPrototype(realm, i.IteratorPrototype);
  initialiseArrayIteratorPrototype(realm, i.ArrayIteratorPrototype);
  initialiseStringIteratorPrototype(realm, i.StringIteratorPrototype);
  initialiseMapIteratorPrototype(realm, i.MapIteratorPrototype);
  initialiseSetIteratorPrototype(realm, i.SetIteratorPrototype);

  // browser
  i.document = initialiseDocument(realm);

  //
  i.Object = initialiseObject(realm);
  i.Function = initialiseFunction(realm);
  i.Array = initialiseArray(realm);
  i.RegExp = initialiseRegExp(realm);
  i.Date = initialiseDate(realm);
  i.String = initialiseString(realm);
  i.Math = initialiseMath(realm);
  i.Boolean = initialiseBoolean(realm);
  i.Number = initialiseNumber(realm);
  i.Symbol = initialiseSymbol(realm);
  i.JSON = initialiseJSON(realm);
  i.Proxy = initialiseProxy(realm);
  if (realm.compatibility !== 'jsc')
  i.Reflect = initialiseReflect(realm);
  i.Promise = initialisePromise(realm);
  i.DataView = initialiseDataView(realm);

  // collections
  i.Set = initialiseSet(realm);
  i.Map = initialiseMap(realm);
  if (realm.compatibility !== 'jsc') {
    i.WeakMap = initialiseWeakMap(realm);
    i.WeakSet = initialiseWeakSet(realm);
  }
  i.ArrayBuffer = initialiseArrayBuffer(realm);

  // typed arrays
  if (realm.compatibility !== 'jsc')
  i.TypedArray = initialiseTypedArray(realm);
  i.Float32Array = initialiseFloat32Array(realm);
  i.Float64Array = initialiseFloat64Array(realm);
  i.Int8Array = initialiseInt8Array(realm);
  i.Int16Array = initialiseInt16Array(realm);
  i.Int32Array = initialiseInt32Array(realm);
  i.Uint8Array = initialiseUint8Array(realm);
  i.Uint8ClampedArray = initialiseUint8ClampedArray(realm);
  i.Uint16Array = initialiseUint16Array(realm);
  i.Uint32Array = initialiseUint32Array(realm);

  //
  i.Error = initialiseError(realm);
  i.TypeError = initialiseTypeError(realm);
  i.RangeError = initialiseRangeError(realm);
  i.ReferenceError = initialiseReferenceError(realm);
  i.URIError = initialiseURIError(realm);
  i.EvalError = initialiseEvalError(realm);
  i.SyntaxError = initialiseSyntaxError(realm);
  i.__IntrospectionError = initialise__IntrospectionError(realm);
  i.__ReadOnlyError = initialise__ReadOnlyError(realm);

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
    "Promise",
    "Uint8Array",
    "Uint8ClampedArray",
    "Uint16Array",
    "Uint32Array",
    "ArrayBuffer"
  ];
  if (realm.compatibility !== 'jsc') {
    builtins = builtins.concat(["WeakMap", "WeakSet", "TypedArray"]);
  }

  for (let name of builtins) {
    let fn = i[name];
    let proto = i[`${name}Prototype`];

    proto.$DefineOwnProperty("constructor", {
      value: fn,
      writable: true,
      enumerable: false,
      configurable: true
    });

    fn.$DefineOwnProperty("prototype", {
      value: proto,
      writable: false,
      enumerable: false,
      configurable: false
    });

    fn.$DefineOwnProperty("constructor", {
      value: i.Function,
      writable: true,
      enumerable: false,
      configurable: true
    });
  }

  //
  i.GeneratorPrototype = new ObjectValue(realm, i.FunctionPrototype, "Generator.prototype");
  initialiseGeneratorPrototype(realm, i.GeneratorPrototype);
  i.Generator = new ObjectValue(realm, i.FunctionPrototype, "Generator");
  initialiseGenerator(realm, i.Generator);
  i.GeneratorFunction = initialiseGeneratorFunction(realm);

  i.Generator.$DefineOwnProperty("prototype", {
    value: i.GeneratorPrototype,
    writable: false,
    enumerable: false,
    configurable: true
  });
  i.GeneratorPrototype.$DefineOwnProperty("constructor", {
    value: i.Generator,
    writable: false,
    enumerable: false,
    configurable: true
  });

  i.GeneratorFunction.$DefineOwnProperty("prototype", {
    value: i.Generator,
    writable: false,
    enumerable: false,
    configurable: false
  });
  i.Generator.$DefineOwnProperty("constructor", {
    value: i.GeneratorFunction,
    writable: false,
    enumerable: false,
    configurable: true
  });

  //
  i.isNaN = initialiseIsNaN(realm);
  i.isFinite = initialiseIsFinite(realm);
  i.decodeURI = initialiseDecodeURI(realm);
  i.decodeURIComponent = initialiseDecodeURIComponent(realm);
  i.encodeURI = initialiseEncodeURI(realm);
  i.encodeURIComponent = initialiseEncodeURIComponent(realm);
  i.ThrowTypeError = initialiseThrowTypeError(realm);
  i.eval = initialiseEval(realm);
  i.console = initialiseConsole(realm);

  // 8.2.2, step 12
  AddRestrictedFunctionProperties(i.FunctionPrototype, realm);

  return i;
}
