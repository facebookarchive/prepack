// Copyright (C) 2016 The V8 Project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-isfinite-number
es6id: 18.2.2
description: >
  The length property of isFinite is 1
includes: [propertyHelper.js]
---*/

assert.sameValue(isFinite.length, 1, "The value of `isFinite.length` is `1`");

verifyNotEnumerable(isFinite, "length");
verifyNotWritable(isFinite, "length");
verifyConfigurable(isFinite, "length");
