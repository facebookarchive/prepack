// Copyright 2016 Mozilla Corporation. All rights reserved.
// This code is governed by the license found in the LICENSE file.

/*---
esid: sec-Intl.PluralRules.supportedLocalesOf
description: Tests that Intl.PluralRules.supportedLocalesOf.name is "supportedLocalesOf"
author: Zibi Braniecki
includes: [propertyHelper.js]
---*/
assert.sameValue(Intl.PluralRules.supportedLocalesOf.name, "supportedLocalesOf");

verifyNotEnumerable(Intl.PluralRules.supportedLocalesOf, "name");
verifyNotWritable(Intl.PluralRules.supportedLocalesOf, "name");
verifyConfigurable(Intl.PluralRules.supportedLocalesOf, "name");
