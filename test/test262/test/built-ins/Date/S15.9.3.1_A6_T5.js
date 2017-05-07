// Copyright 2009 the Sputnik authors.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
info: >
    The [[Value]] property of the newly constructed object
    with supplied "undefined" argument should be NaN
es5id: 15.9.3.1_A6_T5
description: 6 arguments, (year, month, date, hours, minutes, seconds)
---*/

function DateValue(year, month, date, hours, minutes, seconds, ms){
  return new Date(year, month, date, hours, minutes, seconds, ms).valueOf();
}

var x;
x = DateValue(1899, 11, 31, 23, 59, 59);
assert.sameValue(x, NaN, "(1899, 11, 31, 23, 59, 59)");

x = DateValue(1899, 12, 1, 0, 0, 0);
assert.sameValue(x, NaN, "(1899, 12, 1, 0, 0, 0)");

x = DateValue(1900, 0, 1, 0, 0, 0);
assert.sameValue(x, NaN, "(1900, 0, 1, 0, 0, 0)");

x = DateValue(1969, 11, 31, 23, 59, 59);
assert.sameValue(x, NaN, "(1969, 11, 31, 23, 59, 59)");

x = DateValue(1969, 12, 1, 0, 0, 0);
assert.sameValue(x, NaN, "(1969, 12, 1, 0, 0, 0)");

x = DateValue(1970, 0, 1, 0, 0, 0);
assert.sameValue(x, NaN, "(1970, 0, 1, 0, 0, 0)");

x = DateValue(1999, 11, 31, 23, 59, 59);
assert.sameValue(x, NaN, "(1999, 11, 31, 23, 59, 59)");

x = DateValue(1999, 12, 1, 0, 0, 0);
assert.sameValue(x, NaN, "(1999, 12, 1, 0, 0, 0)");

x = DateValue(2000, 0, 1, 0, 0, 0);
assert.sameValue(x, NaN, "(2000, 0, 1, 0, 0, 0)");

x = DateValue(2099, 11, 31, 23, 59, 59);
assert.sameValue(x, NaN, "(2099, 11, 31, 23, 59, 59)");

x = DateValue(2099, 12, 1, 0, 0, 0);
assert.sameValue(x, NaN, "(2099, 12, 1, 0, 0, 0)");

x = DateValue(2100, 0, 1, 0, 0, 0);
assert.sameValue(x, NaN, "(2100, 0, 1, 0, 0, 0)");
