// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
es6id: 22.1.3.1
esid: sec-array.prototype.concat
description: Constructor is ignored for non-Array values
info: |
    1. Let O be ? ToObject(this value).
    2. Let A be ? ArraySpeciesCreate(O, 0).

    9.4.2.3 ArraySpeciesCreate

    [...]
    3. Let isArray be ? IsArray(originalArray).
    4. If isArray is false, return ? ArrayCreate(length).
---*/

var obj = { length: 0 };
var callCount = 0;
var result;
Object.defineProperty(obj, 'constructor', {
  get: function() {
    callCount += 1;
  }
});

result = Array.prototype.concat.call(obj);

assert.sameValue(callCount, 0, '`constructor` property not accessed');
assert.sameValue(Object.getPrototypeOf(result), Array.prototype);
assert(Array.isArray(result), 'result is an Array exotic object');
assert.sameValue(result.length, 1, 'array created with appropriate length');
assert.sameValue(result[0], obj);
