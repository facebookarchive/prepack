// Copyright 2016 Mozilla Corporation. All rights reserved.
// This code is governed by the license found in the LICENSE file.

/*---
description: Intl.NumberFormat.prototype.formatToParts.length. 
includes: [propertyHelper.js]
---*/

assert.sameValue(Intl.NumberFormat.prototype.formatToParts.length, 0);

verifyNotEnumerable(Intl.NumberFormat.prototype.formatToParts, "length");
verifyNotWritable(Intl.NumberFormat.prototype.formatToParts, "length");
verifyConfigurable(Intl.NumberFormat.prototype.formatToParts, "length");
