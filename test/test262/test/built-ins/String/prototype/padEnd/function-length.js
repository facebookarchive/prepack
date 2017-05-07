// Copyright (C) 2016 Jordan Harband. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-string.prototype.padend
description: String#padEnd should have length 1
author: Jordan Harband
includes: [propertyHelper.js]
---*/

assert.sameValue(String.prototype.padEnd.length, 1, 'Expected String#padEnd.length to be 1');

verifyNotEnumerable(String.prototype.padEnd, 'length');
verifyNotWritable(String.prototype.padEnd, 'length');
verifyConfigurable(String.prototype.padEnd, 'length');
