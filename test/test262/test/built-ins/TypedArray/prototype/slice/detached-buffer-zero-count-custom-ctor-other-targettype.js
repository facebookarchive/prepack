// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-%typedarray%.prototype.slice
description: >
  Does not throw a TypeError if buffer is detached on custom constructor and
  `k >= final`. Using other targetType.
info: >
  22.2.3.24 %TypedArray%.prototype.slice ( start, end )

  ...
  9. Let A be ? TypedArraySpeciesCreate(O, « count »).
  ...
  14. If SameValue(srcType, targetType) is false, then
    a. Let n be 0.
    b. Repeat, while k < final
      ...
      ii. Let kValue be ? Get(O, Pk).
      ...
  ...
  16. Return A.
includes: [testTypedArray.js, detachArrayBuffer.js]
features: [Symbol.species]
---*/

testWithTypedArrayConstructors(function(TA) {
  var sample, result, other;
  var ctor = {};
  ctor[Symbol.species] = function(count) {
    other = TA === Int8Array ? Int16Array : Int8Array;
    $DETACHBUFFER(sample.buffer);
    return new other(count);
  };

  sample = new TA(0);
  sample.constructor = ctor;
  result = sample.slice();
  assert.sameValue(result.length, 0, "#1: result.length");
  assert.notSameValue(result.buffer, sample.buffer, "#1: creates a new buffer");
  assert.sameValue(result.constructor, other, "#1: ctor");

  sample = new TA(4);
  sample.constructor = ctor;
  result = sample.slice(1, 1);
  assert.sameValue(result.length, 0, "#2: result.length");
  assert.notSameValue(result.buffer, sample.buffer, "#2: creates a new buffer");
  assert.sameValue(result.constructor, other, "#2: ctor");
});
