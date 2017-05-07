// Copyright 2009 the Sputnik authors.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
info: >
    Result of ToInteger(value) conversion is the result of computing
    sign(ToNumber(value)) * floor(abs(ToNumber(value)))
es5id: 9.4_A3_T2
description: >
    For testing constructor Date(NaN, Infinity, Infinity, +0 and -0)
    is used
---*/

// CHECK#1
var d1 = new Date(Number.NaN);
assert.sameValue(d1.valueOf(), NaN, "NaN");

// CHECK#2
var d2 = new Date(Infinity);
assert.sameValue(d2.valueOf(), NaN, "Infinity");

// CHECK#3
var d3 = new Date(-Infinity);
assert.sameValue(d3.valueOf(), NaN, "-Infinity");

// CHECK#4
var d4 = new Date(0);
if (d4.valueOf() !== 0) {
  $ERROR('#4: var d4 = new Date(0); d4.valueOf() === 0;');
}

// CHECK#5
var d5 = new Date(-0);
if (d5.valueOf() !== -0) {
  $ERROR('#5: var d5 = new Date(-0); d5.valueOf() === -0;');
}
