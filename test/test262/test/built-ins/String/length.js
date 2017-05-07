// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-properties-of-string-instances-length
es6id: 21.1.4.1
description: The "length" property of String objects
info: |
  [...]
  4. Return ? StringCreate(s, ? GetPrototypeFromConstructor(NewTarget,
     "%StringPrototype%")).
includes: [propertyHelper.js]
---*/

var str = new String('');

verifyNotEnumerable(str, 'length');
verifyNotWritable(str, 'length');
verifyNotConfigurable(str, 'length');

assert.sameValue(str.length, 0, 'empty string');

str = new String(' ');
assert.sameValue(str.length, 1, 'whitespace');

str = new String(' \b ');
assert.sameValue(str.length, 3, 'character escape (U+008, "backspace")');

str = new String('\ud834\udf06');
assert.sameValue(str.length, 2,  'Unicode escape (surrogate pair)');
