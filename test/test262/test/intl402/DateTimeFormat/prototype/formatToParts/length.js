// Copyright 2016 Mozilla Corporation. All rights reserved.
// This code is governed by the license found in the LICENSE file.

/*---
description: Intl.DateTimeFormat.prototype.formatToParts.length. 
includes: [propertyHelper.js]
---*/

assert.sameValue(Intl.DateTimeFormat.prototype.formatToParts.length, 1);

verifyNotEnumerable(Intl.DateTimeFormat.prototype.formatToParts, "length");
verifyNotWritable(Intl.DateTimeFormat.prototype.formatToParts, "length");
verifyConfigurable(Intl.DateTimeFormat.prototype.formatToParts, "length");
