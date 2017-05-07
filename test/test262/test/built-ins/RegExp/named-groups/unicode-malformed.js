// Copyright 2017 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
description: Various syntax errors for Unicode RegExps containing named groups
esid: prod-GroupSpecifier
features: [regexp-named-groups]
---*/

assert.throws(SyntaxError, () => eval("/(?<>a)/u"), "Empty name");
assert.throws(SyntaxError, () => eval("/(?<aa)/u"), "Unterminated name");
assert.throws(SyntaxError, () => eval("/(?<42a>a)/u"), "Name starting with digits");
assert.throws(SyntaxError, () => eval("/(?<:a>a)/u"), "Name starting with invalid char");
assert.throws(SyntaxError, () => eval("/(?<a:>a)/u"), "Name containing with invalid char");
assert.throws(SyntaxError, () => eval("/(?<a>a)(?<a>a)/u"), "Duplicate name");
assert.throws(SyntaxError, () => eval("/(?<a>a)(?<b>b)(?<a>a)/u"), "Duplicate name");
assert.throws(SyntaxError, () => eval("/\\k<a>/u"), "Invalid reference");
assert.throws(SyntaxError, () => eval("/\\k<a/u"), "Unterminated reference");
assert.throws(SyntaxError, () => eval("/\\k/u"), "Lone \k");
assert.throws(SyntaxError, () => eval("/(?<a>.)\\k/u"), "Lone \k");
assert.throws(SyntaxError, () => eval("/(?<a>.)\\k<a/u"), "Unterminated reference");
assert.throws(SyntaxError, () => eval("/(?<a>.)\\k<b>/u"), "Invalid reference");
assert.throws(SyntaxError, () => eval("/(?<a>a)\\k<ab>/u"), "Invalid reference");
assert.throws(SyntaxError, () => eval("/(?<ab>a)\\k<a>/u"), "Invalid reference");
assert.throws(SyntaxError, () => eval("/\\k<a>(?<ab>a)/u"), "Invalid reference");
assert.throws(SyntaxError, () => eval("/(?<a>\\a)/u"), "Identity escape in capture");

