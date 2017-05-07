// Copyright 2016 Mozilla Corporation. All rights reserved.
// This code is governed by the license found in the LICENSE file.

/*---
esid: sec-Intl.PluralRules.prototype.select
description: Intl.PluralRules.prototype.select.name is "select"
author: Zibi Braniecki
includes: [propertyHelper.js]
---*/

assert.sameValue(Intl.PluralRules.prototype.select.name, 'select',
  'The value of `Intl.PluralRules.prototype.select.name` is `"select"`'
);

verifyNotEnumerable(Intl.PluralRules.prototype.select, 'name');
verifyNotWritable(Intl.PluralRules.prototype.select, 'name');
verifyConfigurable(Intl.PluralRules.prototype.select, 'name');
