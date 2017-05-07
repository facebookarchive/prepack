// Copyright (C) 2017 Mozilla Corporation.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
description: Test Atomics.compareExchange on arrays that allow atomic operations.
includes: [testAtomics.js, testTypedArray.js]
---*/

var sab = new SharedArrayBuffer(1024);
var ab = new ArrayBuffer(16);

var int_views = [Int8Array, Uint8Array, Int16Array, Uint16Array, Int32Array, Uint32Array];

var good_indices = [ (view) => 0/-1, // -0
                     (view) => '-0',
                     (view) => view.length - 1,
                     (view) => ({ valueOf: () => 0 }),
                     (view) => ({ toString: () => '0', valueOf: false }) // non-callable valueOf triggers invocation of toString
                   ];

testWithTypedArrayConstructors(function(View) {
    // Make it interesting - use non-zero byteOffsets and non-zero indexes.

    var view = new View(sab, 32, 20);
    var control = new View(ab, 0, 2);

    // Performs the exchange
    view[8] = 0;
    assert.sameValue(Atomics.compareExchange(view, 8, 0, 10), 0);
    assert.sameValue(view[8], 10);

    view[8] = 0;
    assert.sameValue(Atomics.compareExchange(view, 8, 1, 10), 0,
                     "Does not perform the exchange");
    assert.sameValue(view[8], 0);

    view[8] = 0;
    assert.sameValue(Atomics.compareExchange(view, 8, 0, -5), 0,
                     "Performs the exchange, coercing the value being stored");
    control[0] = -5;
    assert.sameValue(view[8], control[0]);


    view[3] = -5;
    control[0] = -5;
    assert.sameValue(Atomics.compareExchange(view, 3, -5, 0), control[0],
                     "Performs the exchange, coercing the value being tested");
    assert.sameValue(view[3], 0);


    control[0] = 12345;
    view[3] = 12345;
    assert.sameValue(Atomics.compareExchange(view, 3, 12345, 0), control[0],
                     "Performs the exchange, chopping the value being tested");
    assert.sameValue(view[3], 0);

    control[0] = 123456789;
    view[3] = 123456789;
    assert.sameValue(Atomics.compareExchange(view, 3, 123456789, 0), control[0],
                     "Performs the exchange, chopping the value being tested");
    assert.sameValue(view[3], 0);

    // In-bounds boundary cases for indexing
    testWithAtomicsInBoundsIndices(function(IdxGen) {
        let Idx = IdxGen(view);
        view.fill(0);
        // Atomics.store() computes an index from Idx in the same way as other
        // Atomics operations, not quite like view[Idx].
        Atomics.store(view, Idx, 37);
        assert.sameValue(Atomics.compareExchange(view, Idx, 37, 0), 37);
    });
}, int_views);
