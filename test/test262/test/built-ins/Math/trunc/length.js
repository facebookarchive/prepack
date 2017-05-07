// Copyright 2015 Microsoft Corporation. All rights reserved.
// This code is governed by the license found in the LICENSE file.

/*---
description: length property of Math.trunc
es6id: 20.2.2.35
info: >
  Math.trunc ( x )

  17 ECMAScript Standard Built-in Objects:
    Every built-in Function object, including constructors, that is not
    identified as an anonymous function has a name property whose value
    is a String.

    Unless otherwise specified, the name property of a built-in Function
    object, if it exists, has the attributes { [[Writable]]: false,
    [[Enumerable]]: false, [[Configurable]]: true }.
includes: [propertyHelper.js]
---*/

assert.sameValue(Math.trunc.length, 1);

verifyNotEnumerable(Math.trunc, "length");
verifyNotWritable(Math.trunc, "length");
verifyConfigurable(Math.trunc, "length");
