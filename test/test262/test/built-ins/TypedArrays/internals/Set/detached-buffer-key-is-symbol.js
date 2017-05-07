// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-integer-indexed-exotic-objects-set-p-v-receiver
description: >
  Does not throw on an instance with a detached buffer if key is a Symbol
info: >
  9.4.5.5 [[Set]] ( P, V, Receiver)

  ...
  2. If Type(P) is String, then
    ...
  3. Return ? OrdinarySet(O, P, V, Receiver).
includes: [testTypedArray.js, detachArrayBuffer.js]
features: [Symbol, Reflect]
---*/

var s = Symbol("1");

testWithTypedArrayConstructors(function(TA) {
  var sample = new TA([42, 43]);
  $DETACHBUFFER(sample.buffer);

  assert.sameValue(Reflect.set(sample, s, "test262"), true);
  assert.sameValue(sample[s], "test262");
});
