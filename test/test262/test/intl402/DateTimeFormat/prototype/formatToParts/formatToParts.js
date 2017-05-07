// Copyright 2016 Mozilla Corporation. All rights reserved.
// This code is governed by the license found in the LICENSE file.

/*---
description: Property type and descriptor. 
includes: [propertyHelper.js]
---*/

assert.sameValue(
  typeof Intl.DateTimeFormat.prototype.formatToParts,
  'function',
  '`typeof Intl.DateTimeFormat.prototype.formatToParts` is `function`'
);

verifyNotEnumerable(Intl.DateTimeFormat.prototype, 'formatToParts');
verifyWritable(Intl.DateTimeFormat.prototype, 'formatToParts');
verifyConfigurable(Intl.DateTimeFormat.prototype, 'formatToParts');
