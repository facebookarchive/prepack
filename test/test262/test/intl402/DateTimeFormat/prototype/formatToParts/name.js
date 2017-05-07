// Copyright 2016 Mozilla Corporation. All rights reserved.
// This code is governed by the license found in the LICENSE file.

/*---
description: Intl.DateTimeFormat.prototype.formatToParts.name value and descriptor. 
includes: [propertyHelper.js]
---*/

assert.sameValue(Intl.DateTimeFormat.prototype.formatToParts.name, 'formatToParts',
  'The value of `Intl.DateTimeFormat.prototype.formatToParts.name` is `"formatToParts"`'
);

verifyNotEnumerable(Intl.DateTimeFormat.prototype.formatToParts, 'name');
verifyNotWritable(Intl.DateTimeFormat.prototype.formatToParts, 'name');
verifyConfigurable(Intl.DateTimeFormat.prototype.formatToParts, 'name');
