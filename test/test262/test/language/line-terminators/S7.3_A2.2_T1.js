// Copyright 2009 the Sputnik authors.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
info: CARRIAGE RETURN (U+000D) within strings is not allowed
es5id: 7.3_A2.2_T1
description: Insert CARRIAGE RETURN (\u000D) into string
---*/

assert.throws(SyntaxError, function() {
  eval("'\u000Dstr\u000Ding\u000D'");
});
