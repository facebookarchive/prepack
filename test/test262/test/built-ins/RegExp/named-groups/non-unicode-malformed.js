// Copyright 2017 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
description: >
  Named groups in Unicode RegExps have some syntax errors and some
  compatibility escape fallback behavior.
esid: prod-GroupSpecifier
features: [regexp-named-groups, regexp-lookbehind]
includes: [compareArray.js]
---*/

assert.throws(SyntaxError, () => eval("/(?<>a)/"));
assert.throws(SyntaxError, () => eval("/(?<aa)/"));
assert.throws(SyntaxError, () => eval("/(?<42a>a)/"));
assert.throws(SyntaxError, () => eval("/(?<:a>a)/"));
assert.throws(SyntaxError, () => eval("/(?<a:>a)/"));
assert.throws(SyntaxError, () => eval("/(?<a>a)(?<a>a)/"));
assert.throws(SyntaxError, () => eval("/(?<a>a)(?<b>b)(?<a>a)/"));
assert(/\k<a>/.test("k<a>"));
assert(/\k<4>/.test("k<4>"));
assert(/\k<a/.test("k<a"));
assert(/\k/.test("k"));
assert.throws(SyntaxError, () => eval("/(?<a>.)\\k/"));
assert.throws(SyntaxError, () => eval("/(?<a>.)\\k<a/"));
assert.throws(SyntaxError, () => eval("/(?<a>.)\\k<b>/"));
assert.throws(SyntaxError, () => eval("/(?<a>a)\\k<ab>/"));
assert.throws(SyntaxError, () => eval("/(?<ab>a)\\k<a>/"));
assert.throws(SyntaxError, () => eval("/\\k<a>(?<ab>a)/"));
assert.throws(SyntaxError, () => eval("/\\k<a(?<a>a)/"));
assert(/(?<a>\a)/.test("a"));

assert(compareArray(["k<a>"], "xxxk<a>xxx".match(/\k<a>/)));
assert(compareArray(["k<a"], "xxxk<a>xxx".match(/\k<a/)));

// A couple of corner cases around '\k' as named back-references vs. identity
// escapes.
assert(/\k<a>(?<=>)a/.test("k<a>a"));
assert(/\k<a>(?<!a)a/.test("k<a>a"));
assert(/\k<a>(<a>x)/.test("k<a><a>x"));
assert(/\k<a>(?<a>x)/.test("x"));
assert.throws(SyntaxError, () => eval("/\\k<a>(?<b>x)/"));
assert.throws(SyntaxError, () => eval("/\\k<a(?<a>.)/"));
assert.throws(SyntaxError, () => eval("/\\k(?<a>.)/"));
