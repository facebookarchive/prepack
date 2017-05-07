// Copyright 2017 André Bargull. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: pending
description: >
  Function.prototype.toString on an async generator created with the
  AsyncGenerator constructor.
features: [async-iteration]
---*/

async function* f() {}
var AsyncGenerator = f.constructor;

var g = /* before */AsyncGenerator("a", " /* a */ b, c /* b */ //", "/* c */ ; /* d */ //")/* after */;
assert.sameValue(g.toString(), "async function* anonymous(a, /* a */ b, c /* b */ //\n) {\n/* c */ ; /* d */ //\n}");
