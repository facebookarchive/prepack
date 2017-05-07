// Copyright 2017 Mathias Bynens. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
author: Mathias Bynens
description: >
  Some binary properties used to be part of the Unicode property escapes
  proposal but were later removed. They must not be supported.
esid: sec-static-semantics-unicodematchproperty-p
features: [regexp-unicode-property-escapes]
---*/

assert.throws.early(SyntaxError, "/\\p{Composition_Exclusion}/u");
assert.throws.early(SyntaxError, "/\\P{Composition_Exclusion}/u");
assert.throws.early(SyntaxError, "/\\p{Expands_On_NFC}/u");
assert.throws.early(SyntaxError, "/\\P{Expands_On_NFC}/u");
assert.throws.early(SyntaxError, "/\\p{Expands_On_NFD}/u");
assert.throws.early(SyntaxError, "/\\P{Expands_On_NFD}/u");
assert.throws.early(SyntaxError, "/\\p{Expands_On_NFKC}/u");
assert.throws.early(SyntaxError, "/\\P{Expands_On_NFKC}/u");
assert.throws.early(SyntaxError, "/\\p{Expands_On_NFKD}/u");
assert.throws.early(SyntaxError, "/\\P{Expands_On_NFKD}/u");
assert.throws.early(SyntaxError, "/\\p{FC_NFKC_Closure}/u");
assert.throws.early(SyntaxError, "/\\P{FC_NFKC_Closure}/u");
assert.throws.early(SyntaxError, "/\\p{Full_Composition_Exclusion}/u");
assert.throws.early(SyntaxError, "/\\P{Full_Composition_Exclusion}/u");
assert.throws.early(SyntaxError, "/\\p{Grapheme_Link}/u");
assert.throws.early(SyntaxError, "/\\P{Grapheme_Link}/u");
assert.throws.early(SyntaxError, "/\\p{Hyphen}/u");
assert.throws.early(SyntaxError, "/\\P{Hyphen}/u");
assert.throws.early(SyntaxError, "/\\p{Other_Alphabetic}/u");
assert.throws.early(SyntaxError, "/\\P{Other_Alphabetic}/u");
assert.throws.early(SyntaxError, "/\\p{Other_Default_Ignorable_Code_Point}/u");
assert.throws.early(SyntaxError, "/\\P{Other_Default_Ignorable_Code_Point}/u");
assert.throws.early(SyntaxError, "/\\p{Other_Grapheme_Extend}/u");
assert.throws.early(SyntaxError, "/\\P{Other_Grapheme_Extend}/u");
assert.throws.early(SyntaxError, "/\\p{Other_ID_Continue}/u");
assert.throws.early(SyntaxError, "/\\P{Other_ID_Continue}/u");
assert.throws.early(SyntaxError, "/\\p{Other_ID_Start}/u");
assert.throws.early(SyntaxError, "/\\P{Other_ID_Start}/u");
assert.throws.early(SyntaxError, "/\\p{Other_Lowercase}/u");
assert.throws.early(SyntaxError, "/\\P{Other_Lowercase}/u");
assert.throws.early(SyntaxError, "/\\p{Other_Math}/u");
assert.throws.early(SyntaxError, "/\\P{Other_Math}/u");
assert.throws.early(SyntaxError, "/\\p{Other_Uppercase}/u");
assert.throws.early(SyntaxError, "/\\P{Other_Uppercase}/u");
assert.throws.early(SyntaxError, "/\\p{Prepended_Concatenation_Mark}/u");
assert.throws.early(SyntaxError, "/\\P{Prepended_Concatenation_Mark}/u");
