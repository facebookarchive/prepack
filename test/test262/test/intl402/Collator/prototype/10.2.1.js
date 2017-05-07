// Copyright 2012 Mozilla Corporation. All rights reserved.
// This code is governed by the license found in the LICENSE file.

/*---
es5id: 10.2.1
description: Tests that Intl.Collator.prototype has the required attributes.
author: Norbert Lindenberg
---*/

var desc = Object.getOwnPropertyDescriptor(Intl.Collator, "prototype");
assert.notSameValue(desc, undefined, "Intl.Collator.prototype is not defined.");
assert.sameValue(desc.writable, false, "Intl.Collator.prototype must not be writable.");
assert.sameValue(desc.enumerable, false, "Intl.Collator.prototype must not be enumerable.");
assert.sameValue(desc.configurable, false, "Intl.Collator.prototype must not be configurable.");
