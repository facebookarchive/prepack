// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-%typedarray%.prototype.map
description: >
  Verify conversion values on returned instance
info: >
  22.2.3.19 %TypedArray%.prototype.map ( callbackfn [ , thisArg ] )

  ...
  8. Repeat, while k < len
    ...
    d. Perform ? Set(A, Pk, mappedValue, true).
  ...

  9.4.5.9 IntegerIndexedElementSet ( O, index, value )

  ...
  15. Perform SetValueInBuffer(buffer, indexedPosition, elementType, numValue).
  ...

  24.1.1.6 SetValueInBuffer ( arrayBuffer, byteIndex, type, value [ ,
  isLittleEndian ] )

  ...
  8. If type is "Float32", then
    ...
  9. Else, if type is "Float64", then
    ...
  10. Else,
    ...
    b. Let convOp be the abstract operation named in the Conversion Operation
    column in Table 50 for Element Type type.
    c. Let intValue be convOp(value).
    d. If intValue ≥ 0, then
      ...
    e. Else,
      ...
includes: [byteConversionValues.js, testTypedArray.js]
---*/

testTypedArrayConversions(byteConversionValues, function(TA, value, expected, initial) {
  var sample = new TA([initial]);

  var result = sample.map(function() {
    return value;
  });

  assert.sameValue(result[0], expected, value + " converts to " + expected);
});
