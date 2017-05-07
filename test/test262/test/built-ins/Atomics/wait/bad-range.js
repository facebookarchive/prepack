// Copyright (C) 2017 Mozilla Corporation.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
description: >
  Test range checking of Atomics.wait on arrays that allow atomic operations
includes: [testAtomics.js]
---*/

var sab = new SharedArrayBuffer(4);
var view = new Int32Array(sab);

testWithAtomicsOutOfBoundsIndices(function(IdxGen) {
    let Idx = IdxGen(view);
    assert.throws(RangeError, () => Atomics.wait(view, Idx, 10, 0)); // Even with zero timeout
});
