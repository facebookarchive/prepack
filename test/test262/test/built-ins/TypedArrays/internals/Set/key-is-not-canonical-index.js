// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-integer-indexed-exotic-objects-set-p-v-receiver
description: >
  Use OrginarySet if numeric key is not a CanonicalNumericIndex
info: >
  9.4.5.5 [[Set]] ( P, V, Receiver)

  ...
  2. If Type(P) is String, then
    a. Let numericIndex be ! CanonicalNumericIndexString(P).
    b. If numericIndex is not undefined, then
  ...
  3. Return ? OrdinarySet(O, P, V, Receiver).
includes: [testTypedArray.js]
features: [Reflect]
---*/

var keys = [
  "1.0",
  "+1",
  "1000000000000000000000",
  "0.0000001"
];

testWithTypedArrayConstructors(function(TA) {
  keys.forEach(function(key) {
    var sample = new TA([42]);

    assert.sameValue(
      Reflect.set(sample, key, "ecma262"),
      true,
      "Return true setting a new property [" + key + "]"
    );
    assert.sameValue(sample[key], "ecma262");

    assert.sameValue(
      Reflect.set(sample, key, "es3000"),
      true,
      "Return true setting a value to a writable property [" + key + "]"
    );
    assert.sameValue(sample[key], "es3000");

    Object.defineProperty(sample, key, {
      writable: false,
      value: undefined
    });
    assert.sameValue(
      Reflect.set(sample, key, 42),
      false,
      "Return false setting a value to a non-writable property [" + key + "]"
    );
    assert.sameValue(
      sample[key], undefined, "non-writable [" + key + "] is preserved"
    );
  });
});
