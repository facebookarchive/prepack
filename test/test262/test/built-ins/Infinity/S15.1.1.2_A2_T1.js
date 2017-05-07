// Copyright 2009 the Sputnik authors.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
info: The Infinity is ReadOnly
es5id: 15.1.1.2_A2_T1
description: Checking typeof Functions
includes: [propertyHelper.js]
---*/

// CHECK#1
verifyNotWritable(this, "Infinity", null, true);
if (typeof(Infinity) === "boolean") {
	$ERROR('#1: Infinity = true; typeof(Infinity) !== "boolean". Actual: ' + (typeof(Infinity)));
}
