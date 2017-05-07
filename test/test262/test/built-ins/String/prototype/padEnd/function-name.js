// Copyright (C) 2016 Jordan Harband. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-string.prototype.padend
description: String#padEnd should have name property with value 'padEnd'
author: Jordan Harband
includes: [propertyHelper.js]
---*/

assert.sameValue(
    String.prototype.padEnd.name,
    'padEnd',
    'Expected String#padEnd.name to be "padEnd"'
);

verifyNotEnumerable(String.prototype.padEnd, 'name');
verifyNotWritable(String.prototype.padEnd, 'name');
verifyConfigurable(String.prototype.padEnd, 'name');
