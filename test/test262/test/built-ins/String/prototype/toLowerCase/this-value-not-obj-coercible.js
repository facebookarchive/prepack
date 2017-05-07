// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-string.prototype.tolowercase
es6id: 21.1.3.22
description: The "this" value must be object-coercible
info: |
  1. Let O be ? RequireObjectCoercible(this value).
---*/

var toLowerCase = String.prototype.toLowerCase;

assert.sameValue(typeof toLowerCase, 'function');

assert.throws(TypeError, function() {
  toLowerCase.call(undefined);
}, 'undefined');

assert.throws(TypeError, function() {
  toLowerCase.call(null);
}, 'null');
