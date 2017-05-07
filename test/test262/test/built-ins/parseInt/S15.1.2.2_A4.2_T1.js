// Copyright 2009 the Sputnik authors.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
info: If R < 2 or R > 36, then return NaN
es5id: 15.1.2.2_A4.2_T1
description: R = 1
---*/

assert.sameValue(parseInt("0", 1), NaN, "0");
assert.sameValue(parseInt("1", 1), NaN, "1");
assert.sameValue(parseInt("2", 1), NaN, "2");
assert.sameValue(parseInt("3", 1), NaN, "3");
assert.sameValue(parseInt("4", 1), NaN, "4");
assert.sameValue(parseInt("5", 1), NaN, "5");
assert.sameValue(parseInt("6", 1), NaN, "6");
assert.sameValue(parseInt("7", 1), NaN, "7");
assert.sameValue(parseInt("8", 1), NaN, "8");
assert.sameValue(parseInt("9", 1), NaN, "9");
assert.sameValue(parseInt("10", 1), NaN, "10");
assert.sameValue(parseInt("11", 1), NaN, "11");
