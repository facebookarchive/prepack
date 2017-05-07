// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-%typedarray%.prototype.slice
description: Throws a TypeError buffer is detached on Get custom constructor.
info: >
  22.2.3.24 %TypedArray%.prototype.slice ( start, end )

  ...
  9. Let A be ? TypedArraySpeciesCreate(O, « count »).
  ...
  14. If SameValue(srcType, targetType) is false, then
    ...
  15. Else if count > 0, then
    a. Let srcBuffer be the value of O's [[ViewedArrayBuffer]] internal slot.
    b. If IsDetachedBuffer(srcBuffer) is true, throw a TypeError exception.
  ...
includes: [testTypedArray.js, detachArrayBuffer.js]
features: [Symbol.species]
---*/

testWithTypedArrayConstructors(function(TA) {
  var sample = new TA(1);

  sample.constructor = {};
  sample.constructor[Symbol.species] = function(count) {
    $DETACHBUFFER(sample.buffer);
    return new TA(count);
  };

  assert.throws(TypeError, function() {
    sample.slice();
  }, "step 15.b, IsDetachedBuffer(srcBuffer) is true");
});
