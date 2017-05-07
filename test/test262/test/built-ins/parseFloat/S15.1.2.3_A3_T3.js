// Copyright 2009 the Sputnik authors.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
info: >
    If neither Result(2) nor any prefix of Result(2) satisfies the syntax of a
    StrDecimalLiteral (see 9.3.1), return NaN
es5id: 15.1.2.3_A3_T3
description: parseFloat("wrong numbr format") return NaN
---*/

assert.sameValue(parseFloat(".x"), NaN, ".x");
assert.sameValue(parseFloat("+x"), NaN, "+x");
assert.sameValue(parseFloat("infinity"), NaN, "infinity");
assert.sameValue(parseFloat("A"), NaN, "A");
