// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-integer-indexed-exotic-objects-hasproperty-p
description: >
  Return true for indexed properties
info: >
  9.4.5.2 [[HasProperty]](P)

  ...
  3. If Type(P) is String, then
    a. Let numericIndex be ! CanonicalNumericIndexString(P).
    b. If numericIndex is not undefined, then
      i. Let buffer be the value of O's [[ViewedArrayBuffer]] internal slot.
      ii. If IsDetachedBuffer(buffer) is true, throw a TypeError exception.
      iii. If IsInteger(numericIndex) is false, return false.
      iv. If numericIndex = -0, return false.
      v. If numericIndex < 0, return false.
      vi. If numericIndex ≥ the value of O's [[ArrayLength]] internal slot,
      return false.
      vii. Return true.
  ...
features: [Reflect]
includes: [testTypedArray.js]
---*/

testWithTypedArrayConstructors(function(TA) {
  var sample = new TA([42, 43]);

  assert.sameValue(Reflect.has(sample, 0), true);
  assert.sameValue(Reflect.has(sample, 1), true);
});
