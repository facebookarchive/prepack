// Copyright (C) 2016 Michael Ficarra. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-method-definitions-runtime-semantics-propertydefinitionevaluation
description: Function.prototype.toString on a setter (class; static)
---*/

let x = "h";
class F { static /* before */set /* a */ f /* b */ ( /* c */ a /* d */ ) /* e */ { /* f */ }/* after */ }
class G { static /* before */set /* a */ [ /* b */ "g" /* c */ ] /* d */ ( /* e */ a /* f */ ) /* g */ { /* h */ }/* after */ }
class H { static /* before */set /* a */ [ /* b */ x /* c */ ] /* d */ ( /* e */ a /* f */ ) /* g */ { /* h */ }/* after */ }

let f = Object.getOwnPropertyDescriptor(F, "f").set;
let g = Object.getOwnPropertyDescriptor(G, "g").set;
let h = Object.getOwnPropertyDescriptor(H, "h").set;

assert.sameValue(f.toString(), "set /* a */ f /* b */ ( /* c */ a /* d */ ) /* e */ { /* f */ }");
assert.sameValue(g.toString(), "set /* a */ [ /* b */ \"g\" /* c */ ] /* d */ ( /* e */ a /* f */ ) /* g */ { /* h */ }");
assert.sameValue(h.toString(), "set /* a */ [ /* b */ x /* c */ ] /* d */ ( /* e */ a /* f */ ) /* g */ { /* h */ }");
