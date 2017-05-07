// Copyright (C) 2015 André Bargull. All rights reserved.
// Copyright (C) 2017 Mozilla Corporation. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
description: >
  Atomics.wake.name is "wake".
includes: [propertyHelper.js]
---*/

assert.sameValue(Atomics.wake.name, "wake");

verifyNotEnumerable(Atomics.wake, "name");
verifyNotWritable(Atomics.wake, "name");
verifyConfigurable(Atomics.wake, "name");
