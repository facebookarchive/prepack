// Copyright (C) 2015 André Bargull. All rights reserved.
// Copyright (C) 2017 Mozilla Corporation. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
description: >
  Atomics.sub.name is "sub".
includes: [propertyHelper.js]
---*/

assert.sameValue(Atomics.sub.name, "sub");

verifyNotEnumerable(Atomics.sub, "name");
verifyNotWritable(Atomics.sub, "name");
verifyConfigurable(Atomics.sub, "name");
