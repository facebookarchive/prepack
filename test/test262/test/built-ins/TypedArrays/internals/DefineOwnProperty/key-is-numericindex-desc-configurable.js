// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-integer-indexed-exotic-objects-defineownproperty-p-desc
description: |
  Returns false if key is a numeric index and Desc.[[Configurable]] is true
info: >
  9.4.5.3 [[DefineOwnProperty]] ( P, Desc)
  ...
  3. If Type(P) is String, then
    a. Let numericIndex be ! CanonicalNumericIndexString(P).
    b. If numericIndex is not undefined, then
      ...
      viii. If Desc has a [[Configurable]] field and if Desc.[[Configurable]] is
      true, return false.
  ...
includes: [testTypedArray.js]
features: [Reflect]
---*/

testWithTypedArrayConstructors(function(TA) {
  var sample = new TA(2);

  assert.sameValue(
    Reflect.defineProperty(sample, "0", {
      value: 42,
      configurable: true,
      enumerable: true,
      writable: true
    }),
    false,
    "defineProperty's result"
  );
  assert.sameValue(sample[0], 0, "side effect check");
});
