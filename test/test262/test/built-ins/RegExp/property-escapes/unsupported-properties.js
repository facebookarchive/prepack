// Copyright 2017 Mathias Bynens. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
author: Mathias Bynens
description: >
  Properties not explicitly listed in the Unicode property escapes spec must
  not be supported.
esid: sec-static-semantics-unicodematchproperty-p
features: [regexp-unicode-property-escapes]
---*/

// Non-existent binary properties must not be supported.
assert.throws.early(SyntaxError, "/\\p{UnknownBinaryProperty}/u");
assert.throws.early(SyntaxError, "/\\P{UnknownBinaryProperty}/u");

// Unlisted properties must not be supported.
assert.throws.early(SyntaxError, "/\\p{Line_Break}/u");
assert.throws.early(SyntaxError, "/\\P{Line_Break}/u");
assert.throws.early(SyntaxError, "/\\p{Line_Break=Alphabetic}/u");
assert.throws.early(SyntaxError, "/\\P{Line_Break=Alphabetic}/u");
assert.throws.early(SyntaxError, "/\\p{FC_NFKC_Closure}/u");
assert.throws.early(SyntaxError, "/\\P{FC_NFKC_Closure}/u");
assert.throws.early(SyntaxError, "/\\p{Block=Adlam}/u");
