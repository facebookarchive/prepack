// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-integer-indexed-exotic-objects-get-p-receiver
description: >
  Use OrginaryGet if key is not a CanonicalNumericIndex
info: >
  9.4.5.4 [[Get]] (P, Receiver)

  ...
  2. If Type(P) is String, then
    a. Let numericIndex be ! CanonicalNumericIndexString(P).
    b. If numericIndex is not undefined, then
    ...
  3. Return ? OrdinaryGet(O, P, Receiver).
includes: [testTypedArray.js]
---*/

TypedArray.prototype.baz = "test262";

testWithTypedArrayConstructors(function(TA) {
  var sample = new TA([42, 43]);

  assert.sameValue(
    sample.foo, undefined,
    "return undefined for inexistent properties"
  );

  sample.foo = "bar";
  assert.sameValue(sample.foo, "bar", "return value");

  Object.defineProperty(sample, "bar", {
    get: function() { return "baz"; }
  });
  assert.sameValue(sample.bar, "baz", "return value from get accessor");

  assert.sameValue(sample.baz, "test262", "return value from inherited key");
});
