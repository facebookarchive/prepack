// Copyright 2009 the Sputnik authors.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
info: "CharacterEscape :: c ControlLetter"
es5id: 15.10.2.10_A2.1_T3
es6id: B.1.4
description: "ControlLetter :: RUSSIAN ALPHABET is incorrect"
---*/

//CHECK#0410-042F
for (var alpha = 0x0410; alpha <= 0x042F; alpha++) {
  var str = String.fromCharCode(alpha % 32);
  var arr = (new RegExp("\\c" + String.fromCharCode(alpha))).exec(str);
  assert.sameValue(arr, null, 'RUSSIAN CAPITAL ALPHABET: ' + alpha);
}

//CHECK#0430-044F
for (alpha = 0x0430; alpha <= 0x044F; alpha++) {
  str = String.fromCharCode(alpha % 32);
  arr = (new RegExp("\\c" + String.fromCharCode(alpha))).exec(str);
  assert.sameValue(arr, null, 'russian small alphabet: ' + alpha);
}
