// Copyright (C) 2016 Michael Ficarra. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-function.prototype.tostring
description: Function.prototype.toString on well-known intrinsic function objects
includes: [nativeFunctionMatcher.js]
---*/

let intrinsics = {
  Array, ArrayBuffer, Boolean, DataView, Date, decodeURI, decodeURIComponent, encodeURI,
  encodeURIComponent, Error, eval, EvalError, Float32Array, Float64Array, Function, Int8Array,
  Int16Array, Int32Array, isFinite, isNaN, Map, Number, Object, parseFloat, parseInt, Promise,
  Proxy, RangeError, ReferenceError, RegExp, Set, String, Symbol, SyntaxError, TypeError,
  Uint8Array, Uint8ClampedArray, Uint16Array, Uint32Array, URIError, WeakMap, WeakSet,
};

for (let intrinsicName in intrinsics) {
  let intrinsic = intrinsics[intrinsicName];
  let str = Function.prototype.toString.call(intrinsic);
  assert.sameValue(typeof str, "string");
  assert(RegExp('\\b' + intrinsicName + '\\b').test(str), "contains its name");
  assert(NATIVE_FUNCTION_RE.test(str), "looks pretty much like a NativeFunction");
}
