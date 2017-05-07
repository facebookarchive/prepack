// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-integer-indexed-exotic-objects-set-p-v-receiver
description: >
  Use OrginarySet if key is a Symbol
info: >
  9.4.5.5 [[Set]] ( P, V, Receiver)

  ...
  2. If Type(P) is String, then
  ...
  3. Return ? OrdinarySet(O, P, V, Receiver).
includes: [testTypedArray.js]
features: [Reflect, Symbol]
---*/

var s1 = Symbol("1");
var s2 = Symbol("2");

testWithTypedArrayConstructors(function(TA) {
  var sample = new TA([42]);

  assert.sameValue(
    Reflect.set(sample, s1, "ecma262"),
    true,
    "Return true setting a new property"
  );
  assert.sameValue(sample[s1], "ecma262");

  assert.sameValue(
    Reflect.set(sample, s1, "es3000"),
    true,
    "Return true setting a value to a writable property"
  );
  assert.sameValue(sample[s1], "es3000");

  Object.defineProperty(sample, s2, {
    writable: false,
    value: undefined
  });
  assert.sameValue(
    Reflect.set(sample, s2, 42),
    false,
    "Return false setting a value to a non-writable property"
  );
  assert.sameValue(sample[s2], undefined);
});
