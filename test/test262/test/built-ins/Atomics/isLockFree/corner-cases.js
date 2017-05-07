// Copyright (C) 2017 Mozilla Corporation.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
description: >
  Test isLockFree on various non-intuitive arguments
---*/

assert.sameValue(false, Atomics.isLockFree(hide(3, Number.NaN)));
assert.sameValue(false, Atomics.isLockFree(hide(3, -1)));
assert.sameValue(false, Atomics.isLockFree(hide(3, 3.14)));
assert.sameValue(false, Atomics.isLockFree(hide(3, 0)));

assert.sameValue(Atomics.isLockFree('1'), Atomics.isLockFree(1));
assert.sameValue(Atomics.isLockFree('3'), Atomics.isLockFree(3));

assert.sameValue(Atomics.isLockFree(true), Atomics.isLockFree(1));

assert.sameValue(Atomics.isLockFree(1), Atomics.isLockFree({valueOf: () => 1}));
assert.sameValue(Atomics.isLockFree(3), Atomics.isLockFree({valueOf: () => 3}));
assert.sameValue(Atomics.isLockFree(1), Atomics.isLockFree({toString: () => '1'}));
assert.sameValue(Atomics.isLockFree(3), Atomics.isLockFree({toString: () => '3'}));

function hide(k, x) {
    if (k)
        return hide(k-3, x) + x;
    return 0;
}

