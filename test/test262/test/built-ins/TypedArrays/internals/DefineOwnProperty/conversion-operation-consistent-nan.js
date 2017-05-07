// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-integer-indexed-exotic-objects-defineownproperty-p-desc
description: Consistent canonicalization of NaN values
info: >
  9.4.5.3 [[DefineOwnProperty]] ( P, Desc)

  ...
  3. If Type(P) is String, then
    ...
    b. If numericIndex is not undefined, then
      ...
      xi. If Desc has a [[Value]] field, then
        1. Let value be Desc.[[Value]].
        2. Return ? IntegerIndexedElementSet(O, intIndex, value).
  ...

  9.4.5.9 IntegerIndexedElementSet ( O, index, value )

  ...
  15. Perform SetValueInBuffer(buffer, indexedPosition, elementType, numValue).
  ...

  24.1.1.6 SetValueInBuffer ( arrayBuffer, byteIndex, type, value [ ,
  isLittleEndian ] )

  ...
  8. If type is "Float32", then
     a. Set rawBytes to a List containing the 4 bytes that are the result
        of converting value to IEEE 754-2008 binary32 format using “Round to
        nearest, ties to even” rounding mode. If isLittleEndian is false, the
        bytes are arranged in big endian order. Otherwise, the bytes are
        arranged in little endian order. If value is NaN, rawValue may be set
        to any implementation chosen IEEE 754-2008 binary64 format Not-a-Number
        encoding. An implementation must always choose the same encoding for
        each implementation distinguishable NaN value.
  9. Else, if type is "Float64", then
     a. Set rawBytes to a List containing the 8 bytes that are the IEEE
        754-2008 binary64 format encoding of value. If isLittleEndian is false,
        the bytes are arranged in big endian order. Otherwise, the bytes are
        arranged in little endian order. If value is NaN, rawValue may be set
        to any implementation chosen IEEE 754-2008 binary32 format Not-a-Number
        encoding. An implementation must always choose the same encoding for
        each implementation distinguishable NaN value.
  ...
includes: [nans.js, testTypedArray.js, compareArray.js]
---*/

function body(FloatArray) {
  var sample = new FloatArray(1);
  var control, idx, someNaN, sampleBytes, controlBytes;

  for (idx = 0; idx < distinctNaNs.length; ++idx) {
    someNaN = distinctNaNs[idx];
    control = new FloatArray([someNaN]);

    Object.defineProperty(sample, '0', { value: someNaN });

    sampleBytes = new Uint8Array(sample.buffer);
    controlBytes = new Uint8Array(control.buffer);
    assert(compareArray(sampleBytes, controlBytes));
  }
}

testWithTypedArrayConstructors(body, [Float32Array, Float64Array]);
