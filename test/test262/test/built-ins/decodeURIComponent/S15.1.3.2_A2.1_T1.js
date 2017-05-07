// Copyright 2009 the Sputnik authors.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
info: If string.charAt(k) not equal "%", return this char
es5id: 15.1.3.2_A2.1_T1
description: Complex tests
includes: [decimalToHexString.js]
---*/

//CHECK
var errorCount = 0;
var count = 0;
for (var indexI = 0; indexI <= 65535; indexI++) {
  if (indexI !== 0x25) {
    var hex = decimalToHexString(indexI);
    try {    
      var str = String.fromCharCode(indexI);
      if (decodeURIComponent(str) !== str) {    
        $ERROR('#' + hex + ' ');
        errorCount++;
      }    
    } catch (e){
      $ERROR('#' + hex + ' ');
      errorCount++;
    } 
    count++;
  }
}  

if (errorCount > 0) {    
  $ERROR('Total error: ' + errorCount + ' bad Unicode character in ' + count);
}
