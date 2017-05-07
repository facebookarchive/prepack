// Copyright 2009 the Sputnik authors.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
info: >
    A property name P (in the form of a string value) is an array index
    if and only if ToString(ToUint32(P)) is equal to P and ToUint32(P) is not equal to 2^32 - 1
es5id: 15.4_A1.1_T2
description: Checking for number primitive
---*/

var x = [];

x[NaN] = 1;
assert.sameValue(x[0], undefined, "x[NaN] does not cast to x[0]");
assert.sameValue(x["NaN"], 1, "x[NaN] casts to x['NaN']");

var y = [];
y[Number.POSITIVE_INFINITY] = 1;
assert.sameValue(y[0], undefined, "y[Number.POSITIVE_INFINITY] !== y[0]");
assert.sameValue(y["Infinity"], 1, "y[Number.POSITIVE_INFINITY] === y['Infinity']");

var z = [];
z[Number.NEGATIVE_INFINITY] = 1;
assert.sameValue(z[0], undefined, "z[Number.NEGATIVE_INFINITY] !== z[0]");
assert.sameValue(z["-Infinity"], 1, "z[Number.NEGATIVE_INFINITY] === z['-Infinity']");
