// Copyright (C) 2017 Mozilla Corporation.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
description: >
  Test range checking of Atomics.exchange on arrays that allow atomic operations
includes: [testAtomics.js, testTypedArray.js]
---*/

var sab = new SharedArrayBuffer(4);
var views = [Int8Array, Uint8Array, Int16Array, Uint16Array, Int32Array, Uint32Array];

testWithTypedArrayConstructors(function(View) {
    let view = new View(sab);
    testWithAtomicsOutOfBoundsIndices(function(IdxGen) {
        let Idx = IdxGen(view);
        assert.throws(RangeError, () => Atomics.exchange(view, Idx, 10, 0));
    });
}, views);
