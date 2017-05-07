// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-integer-indexed-exotic-objects-defineownproperty-p-desc
description: |
  Throws a TypeError if object has valid numeric index and a detached buffer
info: >
  9.4.5.3 [[DefineOwnProperty]] ( P, Desc)
  ...
  3. If Type(P) is String, then
    a. Let numericIndex be ! CanonicalNumericIndexString(P).
    b. If numericIndex is not undefined, then
      ...
      xi. If Desc has a [[Value]] field, then
        1. Let value be Desc.[[Value]].
        2. Return ? IntegerIndexedElementSet(O, intIndex, value).
  ...

  9.4.5.9 IntegerIndexedElementSet ( O, index, value )

  ...
  4. Let buffer be the value of O's [[ViewedArrayBuffer]] internal slot.
  5. If IsDetachedBuffer(buffer) is true, throw a TypeError exception.
  ...
includes: [testTypedArray.js, detachArrayBuffer.js]
features: [Reflect]
---*/

var desc = {
  value: 0,
  configurable: false,
  enumerable: true,
  writable: true
};

var obj = {
  valueOf: function() {
    throw new Test262Error();
  }
};

testWithTypedArrayConstructors(function(TA) {
  var sample = new TA(42);
  $DETACHBUFFER(sample.buffer);

  assert.throws(TypeError, function() {
    Reflect.defineProperty(sample, "0", desc);
  }, "Throws TypeError on valid numeric index if instance has a detached buffer");

  assert.sameValue(
    Reflect.defineProperty(sample, "-1", desc),
    false,
    "Return false before Detached Buffer check when value is a negative number"
  );

  assert.sameValue(
    Reflect.defineProperty(sample, "1.1", desc),
    false,
    "Return false before Detached Buffer check when value is not an integer"
  );

  assert.sameValue(
    Reflect.defineProperty(sample, "-0", desc),
    false,
    "Return false before Detached Buffer check when value is -0"
  );

  assert.sameValue(
    Reflect.defineProperty(sample, "2", {
      configurable: true,
      enumerable: true,
      writable: true,
      value: obj
    }),
    false,
    "Return false before Detached Buffer check when desc configurable is true"
  );

  assert.sameValue(
    Reflect.defineProperty(sample, "3", {
      configurable: false,
      enumerable: false,
      writable: true,
      value: obj
    }),
    false,
    "Return false before Detached Buffer check when desc enumerable is false"
  );

  assert.sameValue(
    Reflect.defineProperty(sample, "4", {
      writable: false,
      configurable: false,
      enumerable: true,
      value: obj
    }),
    false,
    "Return false before Detached Buffer check when desc writable is false"
  );

  assert.sameValue(
    Reflect.defineProperty(sample, "42", desc),
    false,
    "Return false before Detached Buffer check when key == [[ArrayLength]]"
  );

  assert.sameValue(
    Reflect.defineProperty(sample, "43", desc),
    false,
    "Return false before Detached Buffer check when key > [[ArrayLength]]"
  );

  assert.sameValue(
    Reflect.defineProperty(sample, "5", {
      get: function() {}
    }),
    false,
    "Return false before Detached Buffer check with accessor descriptor"
  );

  assert.sameValue(
    Reflect.defineProperty(sample, "6", {
      configurable: false,
      enumerable: true,
      writable: true
    }),
    true,
    "Return true before Detached Buffer check when desc value is not present"
  );

  assert.throws(Test262Error, function() {
    Reflect.defineProperty(sample, "7", {value: obj});
  }, "Return Abrupt before Detached Buffer check from ToNumber(desc.value)");
});
