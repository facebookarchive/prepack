// Copyright 2016 Mozilla Corporation. All rights reserved.
// This code is governed by the license found in the LICENSE file.

/*---
description: >
  Throws a TypeError if this is not a NumberFormat object
---*/

var formatToParts = Intl.NumberFormat.prototype.formatToParts;

assert.throws(TypeError, function() {
  formatToParts.call({});
}, "{}");

assert.throws(TypeError, function() {
  formatToParts.call(new Number());
}, "new Number()");
