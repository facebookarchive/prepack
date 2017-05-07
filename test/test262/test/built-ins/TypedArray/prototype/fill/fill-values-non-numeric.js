// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-%typedarray%.prototype.fill
es6id: 22.2.3.8
description: >
  Fills all the elements with non numeric values values.
info: >
  22.2.3.8 %TypedArray%.prototype.fill (value [ , start [ , end ] ] )

  %TypedArray%.prototype.fill is a distinct function that implements the same
  algorithm as Array.prototype.fill as defined in 22.1.3.6 except that the this
  object's [[ArrayLength]] internal slot is accessed in place of performing a
  [[Get]] of "length". The implementation of the algorithm may be optimized with
  the knowledge that the this value is an object that has a fixed length and
  whose integer indexed properties are not sparse. However, such optimization
  must not introduce any observable changes in the specified behaviour of the
  algorithm.

  ...

  22.1.3.6 Array.prototype.fill (value [ , start [ , end ] ] )

  ...
  7. Repeat, while k < final
    a. Let Pk be ! ToString(k).
    b. Perform ? Set(O, Pk, value, true).
  ...

  9.4.5.9 IntegerIndexedElementSet ( O, index, value )

  ...
  3. Let numValue be ? ToNumber(value).
  ...

includes: [testTypedArray.js]
---*/

testWithTypedArrayConstructors(function(TA) {
  var sample;

  sample = new TA([42]);
  sample.fill(null);
  assert.sameValue(sample[0], 0, "null => 0");

  sample = new TA([42]);
  sample.fill(false);
  assert.sameValue(sample[0], 0, "false => 0");

  sample = new TA([42]);
  sample.fill(true);
  assert.sameValue(sample[0], 1, "true => 1");

  sample = new TA([42]);
  sample.fill("7");
  assert.sameValue(sample[0], 7, "string conversion");

  sample = new TA([42]);
  sample.fill({
    toString: function() {
      return 1;
    },
    valueOf: function() {
      return 7; 
    }
  });
  assert.sameValue(sample[0], 7, "object valueOf conversion before toString");

  sample = new TA([42]);
  sample.fill({
    toString: function() {
      return 7;
    }
  });
  assert.sameValue(sample[0], 7, "object toString when valueOf is absent");
});
