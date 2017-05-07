// Copyright (C) 2016 Jordan Harband. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-string.prototype.padend
description: String#padEnd should be writable, non-enumerable, and configurable
author: Jordan Harband
includes: [propertyHelper.js]
---*/

verifyNotEnumerable(String.prototype, 'padEnd');
verifyWritable(String.prototype, 'padEnd');
verifyConfigurable(String.prototype, 'padEnd');
