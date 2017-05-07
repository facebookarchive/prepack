// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-string-exotic-objects-getownproperty-p
es6id: 9.4.3.1
description: >
  Property descriptor for numeric "own" properties of an exotic String object
info: |
  [...]
  12. Let resultStr be a String value of length 1, containing one code unit
      from str, specifically the code unit at index index.
  13. Return a PropertyDescriptor{[[Value]]: resultStr, [[Writable]]: false,
      [[Enumerable]]: true, [[Configurable]]: false}. 
includes: [propertyHelper.js]
---*/

var str = new String('abc');

assert.sameValue(str[0], 'a');
verifyEnumerable(str, '0');
verifyNotWritable(str, '0');
verifyNotConfigurable(str, '0');

assert.sameValue(str[1], 'b');
verifyEnumerable(str, '1');
verifyNotWritable(str, '1');
verifyNotConfigurable(str, '1');

assert.sameValue(str[2], 'c');
verifyEnumerable(str, '2');
verifyNotWritable(str, '2');
verifyNotConfigurable(str, '2');
