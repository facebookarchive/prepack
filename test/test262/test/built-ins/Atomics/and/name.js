// Copyright (C) 2015 André Bargull. All rights reserved.
// Copyright (C) 2017 Mozilla Corporation. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
description: >
  Atomics.and.name is "and".
includes: [propertyHelper.js]
---*/

assert.sameValue(Atomics.and.name, "and");

verifyNotEnumerable(Atomics.and, "name");
verifyNotWritable(Atomics.and, "name");
verifyConfigurable(Atomics.and, "name");
