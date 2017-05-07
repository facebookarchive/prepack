// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-%typedarray%.prototype.includes
description: >
  %TypedArray%.prototype.includes.name is "includes".
info: >
  %TypedArray%.prototype.includes (searchElement [ , fromIndex ] )

  17 ECMAScript Standard Built-in Objects:
    Every built-in Function object, including constructors, that is not
    identified as an anonymous function has a name property whose value
    is a String.

    Unless otherwise specified, the name property of a built-in Function
    object, if it exists, has the attributes { [[Writable]]: false,
    [[Enumerable]]: false, [[Configurable]]: true }.
includes: [propertyHelper.js, testTypedArray.js]
---*/

assert.sameValue(TypedArray.prototype.includes.name, "includes");

verifyNotEnumerable(TypedArray.prototype.includes, "name");
verifyNotWritable(TypedArray.prototype.includes, "name");
verifyConfigurable(TypedArray.prototype.includes, "name");
