// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-integer-indexed-exotic-objects-hasproperty-p
description: Return abrupt from OrdinaryHasProperty parent's [[HasProperty]]
info: >
  9.4.5.2 [[HasProperty]](P)

  ...
  3. If Type(P) is String, then
    a. Let numericIndex be ! CanonicalNumericIndexString(P).
    b. If numericIndex is not undefined, then
      i. Let buffer be the value of O's [[ViewedArrayBuffer]] internal slot.
      ii. If IsDetachedBuffer(buffer) is true, throw a TypeError exception.
  ...

  9.1.7.1 OrdinaryHasProperty (O, P)

  ...
  2. Let hasOwn be ? O.[[GetOwnProperty]](P).
  3. If hasOwn is not undefined, return true.
  4. Let parent be ? O.[[GetPrototypeOf]]().
  5. If parent is not null, then
    a. Return ? parent.[[HasProperty]](P).
  6. Return false.
features: [Reflect, Proxy]
includes: [testTypedArray.js, detachArrayBuffer.js]
---*/

var handler = {
  has: function() {
    throw new Test262Error();
  }
};

var proxy = new Proxy(TypedArray.prototype, handler);

testWithTypedArrayConstructors(function(TA) {
  var sample = new TA(1);

  Object.setPrototypeOf(sample, proxy);

  assert.sameValue(
    Reflect.has(sample, 0), true,
    "OrdinaryHasProperty does not affect numericIndex properties [0]"
  );
  assert.sameValue(
    Reflect.has(sample, 1), false,
    "OrdinaryHasProperty does not affect numericIndex properties [1]"
  );

  assert.throws(Test262Error, function() {
    Reflect.has(sample, "foo");
  }, "Return abrupt from parent's [[HasProperty]] 'foo'");

  Object.defineProperty(sample, "foo", { value: 42 });

  assert.sameValue(
    Reflect.has(sample, "foo"),
    true,
    "trap is not triggered if [[GetOwnProperty]] returns a defined value"
  );
});
