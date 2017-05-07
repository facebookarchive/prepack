// Copyright 2016 Microsoft, Inc. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
author: Brian Terlson <brian.terlson@microsoft.com>
esid: pending
description: >
  Function.prototype.toString on an async function created with the
  AsyncFunction constructor.
features: [async-functions]
---*/
async function f() {}
var AsyncFunction = f.constructor;
var g = /* before */AsyncFunction("a", " /* a */ b, c /* b */ //", "/* c */ ; /* d */ //")/* after */; 
assert.sameValue(g.toString(), "async function anonymous(a, /* a */ b, c /* b */ //\n) {\n/* c */ ; /* d */ //\n}");
