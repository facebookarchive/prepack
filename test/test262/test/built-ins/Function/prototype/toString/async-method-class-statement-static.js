// Copyright 2017 André Bargull. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: pending
description: Function.prototype.toString on an async method
features: [async-functions]
---*/

let x = "h";
class F { static /* before */async f /* a */ ( /* b */ ) /* c */ { /* d */ }/* after */ }
class G { static /* before */async /* a */ [ /* b */ "g" /* c */ ] /* d */ ( /* e */ ) /* f */ { /* g */ }/* after */ }
class H { static /* before */async /* a */ [ /* b */ x /* c */ ] /* d */ ( /* e */ ) /* f */ { /* g */ }/* after */ }

let f = F.f;
let g = G.g;
let h = H.h;

assert.sameValue(f.toString(), "async f /* a */ ( /* b */ ) /* c */ { /* d */ }");
assert.sameValue(g.toString(), "async /* a */ [ /* b */ \"g\" /* c */ ] /* d */ ( /* e */ ) /* f */ { /* g */ }");
assert.sameValue(h.toString(), "async /* a */ [ /* b */ x /* c */ ] /* d */ ( /* e */ ) /* f */ { /* g */ }");
