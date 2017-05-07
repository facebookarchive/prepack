// Copyright 2009 the Sputnik authors.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
info: LINE SEPARATOR (U+2028) within strings is not allowed
es5id: 7.3_A2.3
description: Insert LINE SEPARATOR (\u2028) into string
---*/

assert.throws(SyntaxError, function() {
  eval("'\u2028str\u2028ing\u2028'");
});
