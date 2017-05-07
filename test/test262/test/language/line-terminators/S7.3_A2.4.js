// Copyright 2009 the Sputnik authors.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
info: PARAGRAPH SEPARATOR (U+2029) within strings is not allowed
es5id: 7.3_A2.4
description: Insert PARAGRAPH SEPARATOR (\u2029) into string
---*/

// CHECK#1
assert.throws(SyntaxError, function() {
  eval("'\u2029str\u2029ing\u2029'");
});
