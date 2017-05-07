// Copyright 2016 Mozilla Corporation. All rights reserved.
// This code is governed by the license found in the LICENSE file.

/*---
esid: sec-Intl.PluralRules
description: Intl.PluralRules.length.
author: Zibi Braniecki
includes: [propertyHelper.js]
---*/

assert.sameValue(Intl.PluralRules.length, 0);

verifyNotEnumerable(Intl.PluralRules, "length");
verifyNotWritable(Intl.PluralRules, "length");
verifyConfigurable(Intl.PluralRules, "length");
