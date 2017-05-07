// Copyright (C) 2016 Jordan Harband. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-string.prototype.padstart
description: String#padStart should have name property with value 'padStart'
author: Jordan Harband
includes: [propertyHelper.js]
---*/

assert.sameValue(
    String.prototype.padStart.name,
    'padStart',
    'Expected String#padStart.name to be "padStart"'
);

verifyNotEnumerable(String.prototype.padStart, 'name');
verifyNotWritable(String.prototype.padStart, 'name');
verifyConfigurable(String.prototype.padStart, 'name');
