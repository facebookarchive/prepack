// Copyright 2016 Mozilla Corporation. All rights reserved.
// This code is governed by the license found in the LICENSE file.

/*---
esid: sec-properties-of-intl-pluralrules-prototype-object
description: Tests that Intl.PluralRules.prototype has the required attributes.
author: Zibi Braniecki
---*/

var desc = Object.getOwnPropertyDescriptor(Intl.PluralRules, "prototype");
assert.notSameValue(desc, undefined, "Intl.PluralRules.prototype is not defined.");
assert.sameValue(desc.writable, false, "Intl.PluralRules.prototype must not be writable.");
assert.sameValue(desc.enumerable, false, "Intl.PluralRules.prototype must not be enumerable.");
assert.sameValue(desc.configurable, false, "Intl.PluralRules.prototype must not be configurable.");
