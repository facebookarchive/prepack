// Copyright 2017 Mathias Bynens. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
author: Mathias Bynens
description: >
  Unicode property escapes must not support non-standard grammar extensions.
esid: sec-static-semantics-unicodematchproperty-p
features: [regexp-unicode-property-escapes]
---*/

/\p{General_Category=Letter}/u;
/\P{General_Category=Letter}/u;
assert.throws.early(SyntaxError, "/\\p{^General_Category=Letter}/u");
assert.throws.early(SyntaxError, "/\\p{General_Category:Letter}/u");
assert.throws.early(SyntaxError, "/\\P{General_Category:Letter}/u");
/\p{Letter}/u;
/\P{Letter}/u;
assert.throws.early(SyntaxError, "/\\p{=Letter}/u");
assert.throws.early(SyntaxError, "/\\P{=Letter}/u");
assert.throws.early(SyntaxError, "/\\p{=}/u");
assert.throws.early(SyntaxError, "/\\P{=}/u");
/\p{L}/u;
/\P{L}/u;
assert.throws.early(SyntaxError, "/\\pL/u");
assert.throws.early(SyntaxError, "/\\PL/u");

// Note: `Adlam` is a valid property value for both `Script` and `Block`.
/\p{Script=Adlam}/u;
/\P{Script=Adlam}/u;
assert.throws.early(SyntaxError, "/\\p{IsScript=Adlam}/u");
assert.throws.early(SyntaxError, "/\\P{IsScript=Adlam}/u");
assert.throws.early(SyntaxError, "/\\p{isScript=Adlam}/u");
assert.throws.early(SyntaxError, "/\\P{isScript=Adlam}/u");
assert.throws.early(SyntaxError, "/\\p{InScript=Adlam}/u");
assert.throws.early(SyntaxError, "/\\P{InScript=Adlam}/u");
assert.throws.early(SyntaxError, "/\\p{inScript=Adlam}/u");
assert.throws.early(SyntaxError, "/\\P{inScript=Adlam}/u");
assert.throws.early(SyntaxError, "/\\p{InAdlam}/u");
assert.throws.early(SyntaxError, "/\\P{InAdlam}/u");

assert.throws.early(SyntaxError, "/\\p{/u");
assert.throws.early(SyntaxError, "/\\P{/u");
assert.throws.early(SyntaxError, "/\\p}/u");
assert.throws.early(SyntaxError, "/\\P}/u");
assert.throws.early(SyntaxError, "/\\p/u");
assert.throws.early(SyntaxError, "/\\P/u");
