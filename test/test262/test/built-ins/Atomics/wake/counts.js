// Copyright (C) 2017 Mozilla Corporation.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
description: >
  Allowed boundary cases of the third 'count' argument to Atomics.wake
---*/

var sab = new SharedArrayBuffer(4);
var view = new Int32Array(sab);

assert.sameValue(Atomics.wake(view, 0, -3), 0);
assert.sameValue(Atomics.wake(view, 0, Number.POSITIVE_INFINITY), 0);
assert.sameValue(Atomics.wake(view, 0, undefined), 0);
assert.sameValue(Atomics.wake(view, 0, "33"), 0);
assert.sameValue(Atomics.wake(view, 0, { valueOf: 8 }), 0);
assert.sameValue(Atomics.wake(view, 0), 0);
