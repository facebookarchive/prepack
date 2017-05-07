// Copyright 2016 Mozilla Corporation. All rights reserved.
// This code is governed by the license found in the LICENSE file.

/*---
esid: sec-Intl.PluralRules
description: Intl.PluralRules.name is "PluralRules"
author: Zibi Braniecki
includes: [propertyHelper.js]
---*/

assert.sameValue(Intl.PluralRules.name, "PluralRules");

verifyNotEnumerable(Intl.PluralRules, "name");
verifyNotWritable(Intl.PluralRules, "name");
verifyConfigurable(Intl.PluralRules, "name");
