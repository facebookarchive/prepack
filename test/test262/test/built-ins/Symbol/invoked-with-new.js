// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-symbol-constructor
es6id: 19.4.1
description: The Symbol constructor may not be invoked with `new`
info: |
    1. If NewTarget is not undefined, throw a TypeError exception.
---*/

assert.throws(TypeError, function() {
  new Symbol();
});

assert.throws(TypeError, function() {
  new Symbol('1');
});
