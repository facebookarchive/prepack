// Copyright (C) 2016 The V8 Project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
es6id: 20.1.3.2
esid: sec-number.prototype.toexponential
description: >
  "toExponential" property of Number.prototype
info: >
  ES6 section 17: Every other data property described in clauses 18 through 26
  and in Annex B.2 has the attributes { [[Writable]]: true,
  [[Enumerable]]: false, [[Configurable]]: true } unless otherwise specified.
includes: [propertyHelper.js]
---*/

verifyNotEnumerable(Number.prototype, "toExponential");
verifyWritable(Number.prototype, "toExponential");
verifyConfigurable(Number.prototype, "toExponential");
