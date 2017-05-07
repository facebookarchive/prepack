// Copyright (C) 2016 The V8 Project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
es6id: 20.1.2.11
esid: sec-number.negative_infinity
description: >
  The value of Number.NEGATIVE_INFINITY is -Infinity
info: >
  Number.NEGATIVE_INFINITY

  The value of Number.NEGATIVE_INFINITY is -∞.
includes: [propertyHelper.js]
---*/

assert.sameValue(Number.NEGATIVE_INFINITY, -Infinity);
