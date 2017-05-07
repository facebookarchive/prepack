// Copyright (C) 2016 Michael Ficarra. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-runtime-semantics-bindingclassdeclarationevaluation
description: Function.prototype.toString on a class declaration (implicit constructor)
---*/

/* before */class /* a */ A /* b */ { /* c */ }/* after */
/* before */class /* a */ B /* b */ extends /* c */ A /* d */ { /* e */ }/* after */
/* before */class /* a */ C /* b */ extends /* c */ B /* d */ { /* e */ m /* f */ ( /* g */ ) /* h */ { /* i */ } /* j */ }/* after */

assert.sameValue(A.toString(), "class /* a */ A /* b */ { /* c */ }");
assert.sameValue(B.toString(), "class /* a */ B /* b */ extends /* c */ A /* d */ { /* e */ }");
assert.sameValue(C.toString(), "class /* a */ C /* b */ extends /* c */ B /* d */ { /* e */ m /* f */ ( /* g */ ) /* h */ { /* i */ } /* j */ }");
