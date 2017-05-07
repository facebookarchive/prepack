// Copyright 2017 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
description: Exotic named group names in non-Unicode RegExps
esid: prod-GroupSpecifier
features: [regexp-named-groups]
includes: [compareArray.js]
---*/

assert.sameValue("a", /(?<π>a)/.exec("bab").groups.π);
assert.throws(SyntaxError, () => eval('/(?<\\u{03C0}>a)/'), "\\u{} escapes allowed only in Unicode mode");
assert.sameValue("a", /(?<π>a)/.exec("bab").groups.\u03C0);
assert.sameValue("a", /(?<$>a)/.exec("bab").groups.$);
assert.sameValue("a", /(?<_>a)/.exec("bab").groups._);
assert.throws(SyntaxError, () => eval('/(?<$𐒤>a)/'), "Individual surrogates not in ID_Continue");
assert.sameValue("a", /(?<_\u200C>a)/.exec("bab").groups._\u200C);
assert.sameValue("a", /(?<_\u200D>a)/.exec("bab").groups._\u200D);
assert.sameValue("a", /(?<ಠ_ಠ>a)/.exec("bab").groups.ಠ_ಠ);
assert.throws(SyntaxError, () => eval('/(?<❤>a)/'));
assert.throws(SyntaxError, () => eval('/(?<𐒤>a)/'), "Individual surrogate not in ID_Start.");

// Unicode escapes in capture names.
assert.throws(SyntaxError, () => eval("/(?<a\\uD801\uDCA4>.)/"));
assert.throws(SyntaxError, () => eval("/(?<a\\uD801>.)/"));
assert.throws(SyntaxError, () => eval("/(?<a\\uDCA4>.)/"));
assert(/(?<\u0041>.)/.test("a"));
assert.throws(SyntaxError, () => eval("/(?<a\\u{104A4}>.)/"));
assert.throws(SyntaxError, () => eval("/(?<a\\u{10FFFF}>.)/"));
assert.throws(SyntaxError, () => eval("/(?<a\uD801>.)/"), "Lea");
assert.throws(SyntaxError, () => eval("/(?<a\uDCA4>.)/"), "Trai");
assert(RegExp("(?<\u{0041}>.)").test("a"), "Non-surrogate");

// Bracketed escapes are not allowed;
// 4-char escapes must be the proper ID_Start/ID_Continue
assert.throws(SyntaxError, () => eval("/(?<a\\uD801>.)/"), "Lead");
assert.throws(SyntaxError, () => eval("/(?<a\\uDCA4>.)/"), "Trail");
assert.throws(SyntaxError, () => eval("/(?<\\u{0041}>.)/"), "Non-surrogate");
assert.throws(SyntaxError, () => eval("/(?<a\\u{104A4}>.)/"), "Surrogate, ID_Continue");
assert(RegExp("(?<\\u0041>.)").test("a"), "Non-surrogate");

// Backslash is not allowed as ID_Start and ID_Continue
assert.throws(SyntaxError, () => eval("/(?<\\>.)/"), "'\' misclassified as ID_Start");
assert.throws(SyntaxError, () => eval("/(?<a\\>.)/"), "'\' misclassified as ID_Continue");
