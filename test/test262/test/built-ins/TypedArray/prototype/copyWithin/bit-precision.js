// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-%typedarray%.prototype.copywithin
es6id: 22.2.3.5
description: Preservation of bit-level encoding
info: |
  Array.prototype.copyWithin (target, start [ , end ] )

  12. Repeat, while count > 0
    [...]
    d. If fromPresent is true, then
      i. Let fromVal be ? Get(O, fromKey).
      ii. Perform ? Set(O, toKey, fromVal, true).
includes: [nans.js, compareArray.js, testTypedArray.js]
---*/

function body(FloatArray) {
  var subject = new FloatArray(distinctNaNs.length * 2);

  distinctNaNs.forEach(function(v, i) {
    subject[i] = v;
  });

  var originalBytes, copiedBytes;
  var length = distinctNaNs.length * FloatArray.BYTES_PER_ELEMENT;

  originalBytes = new Uint8Array(
    subject.buffer,
    0,
    length
  );

  subject.copyWithin(distinctNaNs.length, 0);
  copiedBytes = new Uint8Array(
    subject.buffer,
    length
  );

  assert(compareArray(originalBytes, copiedBytes));
}

testWithTypedArrayConstructors(body, [Float32Array, Float64Array]);
