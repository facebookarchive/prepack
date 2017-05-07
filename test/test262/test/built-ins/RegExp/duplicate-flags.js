// Copyright 2017 the V8 project authors.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
info: >
    RegExpInitialize ( obj, pattern, flags )
      5. If F contains any code unit other than "g", "i", "m", "s", "u", or "y" or if it contains the same code unit more than once, throw a SyntaxError exception.
esid: sec-regexpinitialize
description: Check that duplicate RegExp flags are disallowed
features: [regexp-dotall]
---*/

assert.throws(SyntaxError, () => new RegExp("", "migg"), "duplicate g");
assert.throws(SyntaxError, () => new RegExp("", "ii"), "duplicate i");
assert.throws(SyntaxError, () => new RegExp("", "mm"), "duplicate m");
assert.throws(SyntaxError, () => new RegExp("", "ss"), "duplicate s");
assert.throws(SyntaxError, () => new RegExp("", "uu"), "duplicate u");
assert.throws(SyntaxError, () => new RegExp("", "yy"), "duplicate y");
