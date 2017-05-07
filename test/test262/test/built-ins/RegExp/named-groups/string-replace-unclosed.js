// Copyright 2017 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
description: SyntaxError is thrown for malformed replacements
esid: sec-getsubstitution
features: [regexp-named-groups]
info: >
  Runtime Semantics: GetSubstitution( matched, str, position, captures, namedCaptures, replacement )

  Table: Replacement Text Symbol Substitutions

  Unicode Characters: $<
  Replacement text:
    2. Otherwise,
      a. Scan until the next >, throwing a SyntaxError exception if one is not found, and let the enclosed substring be groupName.
---*/

let source = "(?<fst>.)(?<snd>.)|(?<thd>x)";
for (let flags of ["", "u", "g", "gu"]) {
  let re = new RegExp(source, flags);
  assert.throws(SyntaxError, () => "abcd".replace(re, "$<snd"),
                "unclosed named group in replacement should throw a SyntaxError");
}
