// Copyright (C) 2017 Leo Balter. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-array.prototype.concat
description: >
  Array.prototype.concat is not a constructor.
info: |
  17 ECMAScript Standard Built-in Objects

  Built-in function objects that are not identified as constructors do not
  implement the [[Construct]] internal method unless otherwise specified in
  the description of a particular function.
---*/

assert.throws(TypeError, function() {
  new Array.prototype.concat();
});

assert.throws(TypeError, function() {
  new [].concat();
});
