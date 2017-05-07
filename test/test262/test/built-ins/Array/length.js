// Copyright (C) 2017 Leo Balter. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-array-constructor
description: >
  Array has a "length" property whose value is 1.
info: |
  22.1.1 The Array Constructor

  The length property of the Array constructor function is 1.
  ...

  ES7 section 17: Unless otherwise specified, the length property of a built-in
  Function object has the attributes { [[Writable]]: false, [[Enumerable]]:
  false, [[Configurable]]: true }.
includes: [propertyHelper.js]
---*/

assert.sameValue(Array.length, 1);

verifyNotEnumerable(Array, 'length');
verifyNotWritable(Array, 'length');
verifyConfigurable(Array, 'length');
