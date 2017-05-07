// Copyright 2009 the Sputnik authors.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
info: Result of appying "typeof" operator to number is "number"
es5id: 11.4.3_A3.4
es6id: 12.5.6.1
description: typeof (number value) === "number"
---*/

assert.sameValue(
  typeof 1,
  "number",
  'typeof 1 === "number". Actual: ' + (typeof 1)
);

assert.sameValue(
  typeof NaN,
  "number",
  'typeof NaN === "number". Actual: ' + (typeof NaN)
);

assert.sameValue(
  typeof Infinity,
  "number",
  'typeof Infinity === "number". Actual: ' + (typeof Infinity)
);

assert.sameValue(
  typeof -Infinity,
  "number",
  'typeof -Infinity === "number". Actual: ' + (typeof -Infinity)
);

assert.sameValue(
  typeof Math.PI,
  "number",
  'typeof Math.PI === "number". Actual: ' + (typeof Math.PI)
);
