// Copyright 2017 Mathias Bynens. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
author: Mathias Bynens
description: >
  Non-existent properties must not be supported in Unicode property escapes.
esid: sec-static-semantics-unicodematchproperty-p
features: [regexp-unicode-property-escapes]
---*/

assert.throws.early(SyntaxError, "/\\p{UnknownBinaryProperty}/u");
assert.throws.early(SyntaxError, "/\\P{UnknownBinaryProperty}/u");

assert.throws.early(SyntaxError, "/\\p{Line_Breakz=Alphabetic}/u");
assert.throws.early(SyntaxError, "/\\P{Line_Breakz=Alphabetic}/u");
