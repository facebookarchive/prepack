// Copyright (C) 2009 the Sputnik authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
es6id: 20.1.3.1
esid: sec-number.prototype.constructor
description: >
  Property descriptor and value for Number.prototype.constructor
info: >
  Number.prototype.constructor

  The initial value of Number.prototype.constructor is the intrinsic object
  %Number%.
includes: [propertyHelper.js]
---*/

assert.sameValue(Number.prototype.constructor, Number);

verifyNotEnumerable(Number.prototype, "constructor");
verifyWritable(Number.prototype, "constructor");
verifyConfigurable(Number.prototype, "constructor");
