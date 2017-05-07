// Copyright (C) 2016 Michael Ficarra. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-function-definitions-runtime-semantics-instantiatefunctionobject
description: Function.prototype.toString on a function with a non-simple parameter list
---*/

/* before */function /* a */ f /* b */ ( /* c */ a /* d */ = /* e */ 0 /* f */ , /* g */ { /* h */ b /* i */ = /* j */ 0 /* k */ } /* l */ ) /* m */ { /* n */ }/* after */

assert.sameValue(f.toString(), "function /* a */ f /* b */ ( /* c */ a /* d */ = /* e */ 0 /* f */ , /* g */ { /* h */ b /* i */ = /* j */ 0 /* k */ } /* l */ ) /* m */ { /* n */ }");
