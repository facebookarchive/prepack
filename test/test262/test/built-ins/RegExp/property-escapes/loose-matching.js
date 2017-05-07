// Copyright 2017 Mathias Bynens. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
author: Mathias Bynens
description: >
  Loose matching must not be applied when matching properties and values in
  Unicode property escapes.
esid: sec-static-semantics-unicodematchproperty-p
features: [regexp-unicode-property-escapes]
---*/

/\p{Any}/u;
assert.throws.early(SyntaxError, "/\\p{any}/u");
assert.throws.early(SyntaxError, "/\\P{ANY}/u");

/\p{ASCII}/u;
assert.throws.early(SyntaxError, "/\\p{ascii}/u");
assert.throws.early(SyntaxError, "/\\P{Ascii}/u");

/\p{Assigned}/u;
assert.throws.early(SyntaxError, "/\\p{assigned}/u");
assert.throws.early(SyntaxError, "/\\P{ASSIGNED}/u");

/\p{General_Category=Uppercase_Letter}/u;
/\P{General_Category=Uppercase_Letter}/u;
assert.throws.early(SyntaxError, "/\\p{General_Category = Uppercase_Letter}/u");
assert.throws.early(SyntaxError, "/\\P{ General_Category=Uppercase_Letter }/u");
assert.throws.early(SyntaxError, "/\\p{gc=uppercaseletter}/u");
assert.throws.early(SyntaxError, "/\\P{gC=uppercase_letter}/u");

/\p{Lowercase}/u;
/\P{Lowercase}/u;
assert.throws.early(SyntaxError, "/\\p{lowercase}/u");
assert.throws.early(SyntaxError, "/\\p{ Lowercase }/u");
assert.throws.early(SyntaxError, "/\\P{_-_lOwEr_C-A_S-E_-_}/u");
