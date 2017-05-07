// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-integer-indexed-exotic-objects-set-p-v-receiver
description: >
  Returns abrupt from ToNumber(value)
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
  ...
includes: [testTypedArray.js]
---*/

testWithTypedArrayConstructors(function(TA) {
  var sample = new TA([42]);

  var obj = {
    valueOf: function() {
      throw new Test262Error();
    }
  };

  assert.throws(Test262Error, function() {
    sample["0"] = obj;
  }, "ToNumber check with a valid index");

  assert.throws(Test262Error, function() {
    sample["1.1"] = obj;
  }, "ToNumber runs before ToInteger(index)");

  assert.throws(Test262Error, function() {
    sample["-0"] = obj;
  }, "ToNumber runs before -0 check");

  assert.throws(Test262Error, function() {
    sample["-1"] = obj;
  }, "ToNumber runs before < 0 check");

  assert.throws(Test262Error, function() {
    sample["1"] = obj;
  }, "ToNumber runs before index == length check");

  assert.throws(Test262Error, function() {
    sample["2"] = obj;
  }, "ToNumber runs before index > length check");
});
