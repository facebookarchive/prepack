// Copyright (C) 2016 The V8 Project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
es6id: 20.1.3.6
esid: sec-number.prototype.tostring
description: >
  "toString" property of Number.prototype
info: >
  17 ECMAScript Standard Built-in Objects:

  Every other data property described in clauses 18 through 26 and in Annex B.2
  has the attributes { [[Writable]]: true, [[Enumerable]]: false,
  [[Configurable]]: true } unless otherwise specified.
includes: [propertyHelper.js]
---*/

verifyNotEnumerable(Number.prototype, "toString");
verifyWritable(Number.prototype, "toString");
verifyConfigurable(Number.prototype, "toString");
