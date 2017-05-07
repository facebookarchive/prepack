// Copyright 2009 the Sputnik authors.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
info: >
    Result of number conversion from number value equals to the input
    argument (no conversion)
es5id: 9.3_A4.1_T2
description: >
    Some numbers including Number.MAX_VALUE and Number.MIN_VALUE are
    converted to Number with implicit transformation
---*/

// CHECK#1
if (+(13) !== 13) {
  $ERROR('#1: +(13) === 13. Actual: ' + (+(13)));
}

// CHECK#2
if (+(-13) !== -13) { 
  $ERROR('#2: +(-13) === -13. Actual: ' + (+(-13)));
}

// CHECK#3
if (+(1.3) !== 1.3) {
  $ERROR('#3: +(1.3) === 1.3. Actual: ' + (+(1.3)));
}

// CHECK#4
if (+(-1.3) !== -1.3) {
  $ERROR('#4: +(-1.3) === -1.3. Actual: ' + (+(-1.3)));
}
