// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-%typedarray%.prototype.find
es6id: 22.2.3.10
description: >
  Predicate may detach the buffer
info: >
  22.2.3.10 %TypedArray%.prototype.find (predicate [ , thisArg ] )

  %TypedArray%.prototype.find is a distinct function that implements the same
  algorithm as Array.prototype.find as defined in 22.1.3.8

  ...

  However, such optimization must not introduce any observable changes in the
  specified behaviour of the algorithm and must take into account the
  possibility that calls to predicate may cause the this value to become
  detached.

  ...

  22.1.3.8 Array.prototype.find ( predicate[ , thisArg ] )

  ...
  4. If thisArg was supplied, let T be thisArg; else let T be undefined.
  5. Let k be 0.
  6. Repeat, while k < len
    ...
    b. Let kValue be ? Get(O, Pk).
    c. Let testResult be ToBoolean(? Call(predicate, T, « kValue, k, O »)).
  ...

  9.4.5.8 IntegerIndexedElementGet ( O, index )

  ...
  3. Let buffer be the value of O's [[ViewedArrayBuffer]] internal slot.
  4. If IsDetachedBuffer(buffer) is true, throw a TypeError exception.
  ...
includes: [testTypedArray.js, detachArrayBuffer.js]
---*/

testWithTypedArrayConstructors(function(TA) {
  var sample = new TA(2);
  var loops = 0;
  var completion = false;

  assert.throws(TypeError, function() {
    sample.find(function() {
      loops++;
      $DETACHBUFFER(sample.buffer);
      completion = true;
    });
  }, "throws a TypeError getting a value from the detached buffer");

  assert.sameValue(loops, 1, "predicate is called once");
  assert(completion, "abrupt completion does not come from DETACHBUFFER");
});
