// Copyright 2016 Mozilla Corporation. All rights reserved.
// This code is governed by the license found in the LICENSE file.

/*---
description: Property type and descriptor. 
includes: [propertyHelper.js]
---*/

assert.sameValue(
  typeof Intl.NumberFormat.prototype.formatToParts,
  'function',
  '`typeof Intl.NumberFormat.prototype.formatToParts` is `function`'
);

verifyNotEnumerable(Intl.NumberFormat.prototype, 'formatToParts');
verifyWritable(Intl.NumberFormat.prototype, 'formatToParts');
verifyConfigurable(Intl.NumberFormat.prototype, 'formatToParts');
