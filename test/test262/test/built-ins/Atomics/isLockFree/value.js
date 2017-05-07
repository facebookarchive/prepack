// Copyright (C) 2017 Mozilla Corporation.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
description: >
  Test isLockFree on nonnegative integer arguments
---*/

var sizes   = [    1,     2,     3,     4,     5,     6,     7,  8,
                   9,    10,    11,    12];
var answers = [   {},    {}, false,  true, false, false, false, false,
               false, false, false, false];

function testIsLockFree() {
    var saved = {};

    // This should defeat most optimizations.

    for ( var i=0 ; i < sizes.length ; i++ ) {
        var v = Atomics.isLockFree(sizes[i]);
        var a = answers[i];
        assert.sameValue(typeof v, 'boolean');
        if (typeof a == 'boolean')
            assert.sameValue(v, a);
        else
            saved[sizes[i]] = v;
    }

    // This ought to be optimizable.  Make sure the answers are the same
    // as for the unoptimized case.

    assert.sameValue(Atomics.isLockFree(1), saved[1]);
    assert.sameValue(Atomics.isLockFree(2), saved[2]);
    assert.sameValue(Atomics.isLockFree(3), false);
    assert.sameValue(Atomics.isLockFree(4), true);
    assert.sameValue(Atomics.isLockFree(5), false);
    assert.sameValue(Atomics.isLockFree(6), false);
    assert.sameValue(Atomics.isLockFree(7), false);
    assert.sameValue(Atomics.isLockFree(8), false);
    assert.sameValue(Atomics.isLockFree(9), false);
    assert.sameValue(Atomics.isLockFree(10), false);
    assert.sameValue(Atomics.isLockFree(11), false);
    assert.sameValue(Atomics.isLockFree(12), false);
}

testIsLockFree();
