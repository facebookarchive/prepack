// Copyright 2017 André Bargull. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-async-arrow-function-definitions-runtime-semantics-evaluation
description: Function.prototype.toString on an async arrow function
features: [async-functions]
---*/

let f = /* before */async /* a */ ( /* b */ a /* c */ , /* d */ b /* e */ ) /* f */ => /* g */ { /* h */ ; /* i */ }/* after */;
let g = /* before */async /* a */ ( /* b */ ) /* c */ => /* d */ 0/* after */;
let h = /* before */async /* a */ a /* b */ => /* c */ 0/* after */;

assert.sameValue(f.toString(), "async /* a */ ( /* b */ a /* c */ , /* d */ b /* e */ ) /* f */ => /* g */ { /* h */ ; /* i */ }");
assert.sameValue(g.toString(), "async /* a */ ( /* b */ ) /* c */ => /* d */ 0");
assert.sameValue(h.toString(), "async /* a */ a /* b */ => /* c */ 0");
