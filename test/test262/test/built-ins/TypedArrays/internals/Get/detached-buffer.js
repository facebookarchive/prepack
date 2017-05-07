// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-integer-indexed-exotic-objects-get-p-receiver
description: >
  Throws a TypeError if key has a numeric index and object has a detached buffer
info: >
  9.4.5.4 [[Get]] (P, Receiver)

  ...
  2. If Type(P) is String, then
    a. Let numericIndex be ! CanonicalNumericIndexString(P).
    b. If numericIndex is not undefined, then
      i. Return ? IntegerIndexedElementGet(O, numericIndex).
  ...
includes: [testTypedArray.js, detachArrayBuffer.js]
---*/

testWithTypedArrayConstructors(function(TA) {
  var sample = new TA([42]);
  $DETACHBUFFER(sample.buffer);

  assert.throws(TypeError, function() {
    sample[0];
  }, "valid numeric index");

  assert.throws(TypeError, function() {
    sample["1.1"];
  }, "detach buffer runs before checking for 1.1");

  assert.throws(TypeError, function() {
    sample["-0"];
  }, "detach buffer runs before checking for -0");

  assert.throws(TypeError, function() {
    sample["-1"];
  }, "detach buffer runs before checking for -1");

  assert.throws(TypeError, function() {
    sample["1"];
  }, "detach buffer runs before checking for key == length");

  assert.throws(TypeError, function() {
    sample["2"];
  }, "detach buffer runs before checking for key > length");
});
