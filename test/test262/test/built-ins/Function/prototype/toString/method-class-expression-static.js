// Copyright (C) 2016 Michael Ficarra. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-runtime-semantics-definemethod
description: Function.prototype.toString on a method (class; static)
---*/

let x = "h";
let f = class { static /* before */f /* a */ ( /* b */ ) /* c */ { /* d */ }/* after */ }.f;
let g = class { static /* before */[ /* a */ "g" /* b */ ] /* c */ ( /* d */ ) /* e */ { /* f */ }/* after */ }.g;
let h = class { static /* before */[ /* a */ x /* b */ ] /* c */ ( /* d */ ) /* e */ { /* f */ }/* after */ }.h;

assert.sameValue(f.toString(), "f /* a */ ( /* b */ ) /* c */ { /* d */ }");
assert.sameValue(g.toString(), "[ /* a */ \"g\" /* b */ ] /* c */ ( /* d */ ) /* e */ { /* f */ }");
assert.sameValue(h.toString(), "[ /* a */ x /* b */ ] /* c */ ( /* d */ ) /* e */ { /* f */ }");
