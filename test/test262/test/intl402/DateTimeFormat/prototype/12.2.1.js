// Copyright 2012 Mozilla Corporation. All rights reserved.
// This code is governed by the license found in the LICENSE file.

/*---
es5id: 12.2.1
description: >
    Tests that Intl.DateTimeFormat.prototype has the required
    attributes.
author: Norbert Lindenberg
---*/

var desc = Object.getOwnPropertyDescriptor(Intl.DateTimeFormat, "prototype");
assert.notSameValue(desc, undefined, "Intl.DateTimeFormat.prototype is not defined.");
assert.sameValue(desc.writable, false, "Intl.DateTimeFormat.prototype must not be writable.");
assert.sameValue(desc.enumerable, false, "Intl.DateTimeFormat.prototype must not be enumerable.");
assert.sameValue(desc.configurable, false, "Intl.DateTimeFormat.prototype must not be configurable.");
