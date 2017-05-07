// Copyright 2017 Mathias Bynens. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
author: Mathias Bynens
description: >
  Non-existent property values must not be supported in Unicode property
  escapes.
esid: sec-static-semantics-unicodematchproperty-p
features: [regexp-unicode-property-escapes]
---*/

assert.throws.early(SyntaxError, "/\\p{General_Category=WAT}/u");
assert.throws.early(SyntaxError, "/\\P{Line_Breakz=WAT}/u");

assert.throws.early(SyntaxError, "/\\p{Script=FooBarBazInvalid}/u");
assert.throws.early(SyntaxError, "/\\P{Script=FooBarBazInvalid}/u");

assert.throws.early(SyntaxError, "/\\p{Script_Extensions=H_e_h}/u");
assert.throws.early(SyntaxError, "/\\P{Script_Extensions=H_e_h}/u");
