// Copyright (C) 2016 The V8 Project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-isnan-number
es6id: 18.2.3
description: >
  The length property of isNaN is 1
includes: [propertyHelper.js]
---*/

assert.sameValue(isNaN.length, 1, "The value of `isNaN.length` is `1`");

verifyNotEnumerable(isNaN, "length");
verifyNotWritable(isNaN, "length");
verifyConfigurable(isNaN, "length");
