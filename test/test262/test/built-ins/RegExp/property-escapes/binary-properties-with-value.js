// Copyright 2017 Mathias Bynens. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
author: Mathias Bynens
description: >
  Binary properties with an explicit value must throw in Unicode property
  escapes (even if the value is valid).
esid: sec-static-semantics-unicodematchproperty-p
features: [regexp-unicode-property-escapes]
---*/

assert.throws.early(SyntaxError, "/\\p{ASCII=Yes}/u");
assert.throws.early(SyntaxError, "/\\p{ASCII=Y}/u");
assert.throws.early(SyntaxError, "/\\p{ASCII=T}/u");

assert.throws.early(SyntaxError, "/\\P{ASCII=No}/u");
assert.throws.early(SyntaxError, "/\\P{ASCII=N}/u");
assert.throws.early(SyntaxError, "/\\P{ASCII=F}/u");

assert.throws.early(SyntaxError, "/\\p{ASCII=Invalid}/u");
