// Copyright (C) 2016 Michael Ficarra. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-createdynamicfunction
description: Function.prototype.toString on a generator function created with the GeneratorFunction constructor
---*/

let GeneratorFunction = Object.getPrototypeOf(function*(){}).constructor;
let g = /* before */GeneratorFunction("a", " /* a */ b, c /* b */ //", "/* c */ yield yield; /* d */ //")/* after */;

assert.sameValue(g.toString(), "function* anonymous(a, /* a */ b, c /* b */ //\n) {\n/* c */ yield yield; /* d */ //\n}");
