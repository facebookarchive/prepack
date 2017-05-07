// Copyright 2012 Mozilla Corporation. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
es5id: 11.4_a
description: >
    Tests that Intl.NumberFormat instances have the specified
    properties.
author: Norbert Lindenberg
---*/

var obj = new Intl.NumberFormat();

var toStringValue = Object.prototype.toString.call(obj);
assert.sameValue(toStringValue, "[object Object]", "Intl.NumberFormat instance produces wrong [[Class]] - toString returns " + toStringValue + ".");
