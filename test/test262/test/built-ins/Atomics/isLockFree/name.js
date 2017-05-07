// Copyright (C) 2015 André Bargull. All rights reserved.
// Copyright (C) 2017 Mozilla Corporation. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
description: >
  Atomics.isLockFree.name is "isLockFree".
includes: [propertyHelper.js]
---*/

assert.sameValue(Atomics.isLockFree.name, "isLockFree");

verifyNotEnumerable(Atomics.isLockFree, "name");
verifyNotWritable(Atomics.isLockFree, "name");
verifyConfigurable(Atomics.isLockFree, "name");
