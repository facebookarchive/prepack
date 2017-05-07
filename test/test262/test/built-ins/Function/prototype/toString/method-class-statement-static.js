// Copyright (C) 2016 Michael Ficarra. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-runtime-semantics-definemethod
description: Function.prototype.toString on a method (class; static)
---*/

let x = "h";
class F { static /* before */f /* a */ ( /* b */ ) /* c */ { /* d */ }/* after */ }
class G { static /* before */[ /* a */ "g" /* b */ ] /* c */ ( /* d */ ) /* e */ { /* f */ }/* after */ }
class H { static /* before */[ /* a */ x /* b */ ] /* c */ ( /* d */ ) /* e */ { /* f */ }/* after */ }

let f = F.f;
let g = G.g;
let h = H.h;

assert.sameValue(f.toString(), "f /* a */ ( /* b */ ) /* c */ { /* d */ }");
assert.sameValue(g.toString(), "[ /* a */ \"g\" /* b */ ] /* c */ ( /* d */ ) /* e */ { /* f */ }");
assert.sameValue(h.toString(), "[ /* a */ x /* b */ ] /* c */ ( /* d */ ) /* e */ { /* f */ }");
