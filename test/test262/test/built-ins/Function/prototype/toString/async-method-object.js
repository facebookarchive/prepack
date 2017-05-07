// Copyright 2016 Microsoft, Inc. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
author: Brian Terlson <brian.terlson@microsoft.com>
esid: pending
description: Function.prototype.toString on an async method
features: [async-functions]
---*/

let x = "h";
let f = { /* before */async f /* a */ ( /* b */ ) /* c */ { /* d */ }/* after */ }.f;
let g = { /* before */async /* a */ [ /* b */ "g" /* c */ ] /* d */ ( /* e */ ) /* f */ { /* g */ }/* after */ }.g;
let h = { /* before */async /* a */ [ /* b */ x /* c */ ] /* d */ ( /* e */ ) /* f */ { /* g */ }/* after */ }.h;

assert.sameValue(f.toString(), "async f /* a */ ( /* b */ ) /* c */ { /* d */ }");
assert.sameValue(g.toString(), "async /* a */ [ /* b */ \"g\" /* c */ ] /* d */ ( /* e */ ) /* f */ { /* g */ }");
assert.sameValue(h.toString(), "async /* a */ [ /* b */ x /* c */ ] /* d */ ( /* e */ ) /* f */ { /* g */ }");
