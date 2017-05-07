// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-integer-indexed-exotic-objects-set-p-v-receiver
description: >
  Throws a TypeError if key has a numeric index and object has a detached buffer
info: >
  9.4.5.5 [[Set]] ( P, V, Receiver)

  ...
  2. If Type(P) is String, then
    a. Let numericIndex be ! CanonicalNumericIndexString(P).
    b. If numericIndex is not undefined, then
      i. Return ? IntegerIndexedElementSet(O, numericIndex, V).
  ...

  9.4.5.9 IntegerIndexedElementSet ( O, index, value )

  ...
  3. Let numValue be ? ToNumber(value).
  4. Let buffer be the value of O's [[ViewedArrayBuffer]] internal slot.
  5. If IsDetachedBuffer(buffer) is true, throw a TypeError exception.
  ...
includes: [testTypedArray.js, detachArrayBuffer.js]
---*/

testWithTypedArrayConstructors(function(TA) {
  var sample = new TA([42]);
  $DETACHBUFFER(sample.buffer);

  assert.throws(TypeError, function() {
    sample[0] = 1;
  }, "valid numeric index");

  assert.throws(TypeError, function() {
    sample["1.1"] = 1;
  }, "detach buffer runs before checking for 1.1");

  assert.throws(TypeError, function() {
    sample["-0"] = 1;
  }, "detach buffer runs before checking for -0");

  assert.throws(TypeError, function() {
    sample["-1"] = 1;
  }, "detach buffer runs before checking for -1");

  assert.throws(TypeError, function() {
    sample["1"] = 1;
  }, "detach buffer runs before checking for key == length");

  assert.throws(TypeError, function() {
    sample["2"] = 1;
  }, "detach buffer runs before checking for key > length");

  var obj = {
    valueOf: function() {
      throw new Test262Error();
    }
  };

  assert.throws(Test262Error, function() {
    sample["0"] = obj;
  }, "ToNumber(value) is called before detached buffer check");
});
