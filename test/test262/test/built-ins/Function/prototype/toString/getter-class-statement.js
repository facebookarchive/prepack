// Copyright (C) 2016 Michael Ficarra. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-method-definitions-runtime-semantics-propertydefinitionevaluation
description: Function.prototype.toString on a getter (class)
---*/

let x = "h";
class F { /* before */get /* a */ f /* b */ ( /* c */ ) /* d */ { /* e */ }/* after */ }
class G { /* before */get /* a */ [ /* b */ "g" /* c */ ] /* d */ ( /* e */ ) /* f */ { /* g */ }/* after */ }
class H { /* before */get /* a */ [ /* b */ x /* c */ ] /* d */ ( /* e */ ) /* f */ { /* g */ }/* after */ }

let f = Object.getOwnPropertyDescriptor(F.prototype, "f").get;
let g = Object.getOwnPropertyDescriptor(G.prototype, "g").get;
let h = Object.getOwnPropertyDescriptor(H.prototype, "h").get;

assert.sameValue(f.toString(), "get /* a */ f /* b */ ( /* c */ ) /* d */ { /* e */ }");
assert.sameValue(g.toString(), "get /* a */ [ /* b */ \"g\" /* c */ ] /* d */ ( /* e */ ) /* f */ { /* g */ }");
assert.sameValue(h.toString(), "get /* a */ [ /* b */ x /* c */ ] /* d */ ( /* e */ ) /* f */ { /* g */ }");
