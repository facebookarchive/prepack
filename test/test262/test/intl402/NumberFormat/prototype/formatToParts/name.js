// Copyright 2016 Mozilla Corporation. All rights reserved.
// This code is governed by the license found in the LICENSE file.

/*---
description: Intl.NumberFormat.prototype.formatToParts.name value and descriptor. 
includes: [propertyHelper.js]
---*/

assert.sameValue(Intl.NumberFormat.prototype.formatToParts.name, 'formatToParts',
  'The value of `Intl.NumberFormat.prototype.formatToParts.name` is `"formatToParts"`'
);

verifyNotEnumerable(Intl.NumberFormat.prototype.formatToParts, 'name');
verifyNotWritable(Intl.NumberFormat.prototype.formatToParts, 'name');
verifyConfigurable(Intl.NumberFormat.prototype.formatToParts, 'name');
