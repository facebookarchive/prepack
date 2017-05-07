// Copyright (C) 2016 Michael Ficarra. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-arrow-function-definitions-runtime-semantics-evaluation
description: Function.prototype.toString on an arrow function
---*/

let f = /* before */( /* a */ a /* b */ , /* c */ b /* d */ ) /* e */ => /* f */ { /* g */ ; /* h */ }/* after */;
let g = /* before */( /* a */ ) /* b */ => /* c */ 0/* after */;
let h = /* before */a /* a */ => /* b */ 0/* after */;

assert.sameValue(f.toString(), "( /* a */ a /* b */ , /* c */ b /* d */ ) /* e */ => /* f */ { /* g */ ; /* h */ }");
assert.sameValue(g.toString(), "( /* a */ ) /* b */ => /* c */ 0");
assert.sameValue(h.toString(), "a /* a */ => /* b */ 0");
