// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-integer-indexed-exotic-objects-hasproperty-p
description: Throws a TypeError if this has a detached buffer
info: >
  9.4.5.2 [[HasProperty]](P)

  ...
  3. If Type(P) is String, then
    a. Let numericIndex be ! CanonicalNumericIndexString(P).
    b. If numericIndex is not undefined, then
      i. Let buffer be the value of O's [[ViewedArrayBuffer]] internal slot.
      ii. If IsDetachedBuffer(buffer) is true, throw a TypeError exception.
  ...
features: [Reflect]
includes: [testTypedArray.js, detachArrayBuffer.js]
---*/

testWithTypedArrayConstructors(function(TA) {
  var sample = new TA(1);
  $DETACHBUFFER(sample.buffer);

  assert.throws(TypeError, function() {
    Reflect.has(sample, "0");
  }, "0");

  assert.throws(TypeError, function() {
    Reflect.has(sample, "-0");
  }, "-0");

  assert.throws(TypeError, function() {
    Reflect.has(sample, "1.1");
  }, "1.1");
});
