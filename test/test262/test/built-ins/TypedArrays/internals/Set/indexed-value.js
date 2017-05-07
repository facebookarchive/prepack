// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-integer-indexed-exotic-objects-set-p-v-receiver
description: >
  Returns true after setting value
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
  15. Perform SetValueInBuffer(buffer, indexedPosition, elementType, numValue).
  16. Return true.
includes: [testTypedArray.js]
features: [Reflect]
---*/

var proto = TypedArray.prototype;
var throwDesc = {
  set: function() {
    throw new Test262Error("OrdinarySet was called! Ref: 9.1.9.1 3.b.i");
  }
};
Object.defineProperty(proto, "0", throwDesc);
Object.defineProperty(proto, "1", throwDesc);

testWithTypedArrayConstructors(function(TA) {
  var sample = new TA([42, 43]);

  assert.sameValue(Reflect.set(sample, "0", 1), true, "sample[0]");
  assert.sameValue(sample[0], 1, "sample[0] value is set");

  assert.sameValue(Reflect.set(sample, "1", 42), true, "sample[1]");
  assert.sameValue(sample[1], 42, "sample[1] value is set");
});
