// Copyright 2009 the Sputnik authors.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
info: Operator use ToString
es5id: 15.1.2.3_A1_T4
description: Checking for Boolean object
---*/

assert.sameValue(parseFloat(new Boolean(true)), NaN, "new Boolean(true)");
assert.sameValue(parseFloat(new Boolean(false)), NaN, "new Boolean(false)");
