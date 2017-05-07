// Copyright 2009 the Sputnik authors.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
info: Operator use ToString
es5id: 15.1.2.3_A1_T3
description: Checking for undefined and null
---*/

assert.sameValue(parseFloat(undefined), NaN, "undefined");
assert.sameValue(parseFloat(null), NaN, "null");
