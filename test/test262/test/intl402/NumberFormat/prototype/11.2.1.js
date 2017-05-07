// Copyright 2012 Mozilla Corporation. All rights reserved.
// This code is governed by the license found in the LICENSE file.

/*---
es5id: 11.2.1
description: Tests that Intl.NumberFormat.prototype has the required attributes.
author: Norbert Lindenberg
---*/

var desc = Object.getOwnPropertyDescriptor(Intl.NumberFormat, "prototype");
assert.notSameValue(desc, undefined, "Intl.NumberFormat.prototype is not defined.");
assert.sameValue(desc.writable, false, "Intl.NumberFormat.prototype must not be writable.");
assert.sameValue(desc.enumerable, false, "Intl.NumberFormat.prototype must not be enumerable.");
assert.sameValue(desc.configurable, false, "Intl.NumberFormat.prototype must not be configurable.");
