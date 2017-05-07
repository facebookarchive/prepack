// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-%typedarray%.prototype.set-array-offset
description: >
  Throws an error if buffer is detached before setting a value
info: >
  22.2.3.23.1 %TypedArray%.prototype.set (array [ , offset ] )

  1. Assert: array is any ECMAScript language value other than an Object with a
  [[TypedArrayName]] internal slot. If it is such an Object, the definition in
  22.2.3.23.2 applies.
  ...
  21. Repeat, while targetByteIndex < limit
    a. Let Pk be ! ToString(k).
    b. Let kNumber be ? ToNumber(? Get(src, Pk)).
    c. If IsDetachedBuffer(targetBuffer) is true, throw a TypeError exception.
    d. Perform SetValueInBuffer(targetBuffer, targetByteIndex, targetType,
    kNumber).
  ...
includes: [testTypedArray.js, detachArrayBuffer.js]
---*/

testWithTypedArrayConstructors(function(TA) {
  var sample = new TA([1, 2, 3]);
  var obj = {
    length: 3,
    "0": 42
  };
  Object.defineProperty(obj, 1, {
    get: function() {
      $DETACHBUFFER(sample.buffer);
    }
  });
  Object.defineProperty(obj, 2, {
    get: function() {
      throw new Test262Error("Should not get other values");
    }
  });

  assert.throws(TypeError, function() {
    sample.set(obj);
  });
});
