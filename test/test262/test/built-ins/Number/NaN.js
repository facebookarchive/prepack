// Copyright (C) 2016 The V8 Project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
es6id: 20.1.2.10
esid: sec-number.nan
description: >
  "NaN" property descriptor and value of Number
info: >
  20.1.2.10 Number.NaN

  The value of Number.NaN is NaN.

  This property has the attributes { [[Writable]]: false, [[Enumerable]]: false,
  [[Configurable]]: false }.
includes: [propertyHelper.js]
---*/

assert.sameValue(Number.NaN, NaN);

verifyNotEnumerable(Number, "NaN");
verifyNotWritable(Number, "NaN");
verifyNotConfigurable(Number, "NaN");
