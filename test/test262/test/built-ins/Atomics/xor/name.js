// Copyright (C) 2015 André Bargull. All rights reserved.
// Copyright (C) 2017 Mozilla Corporation. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
description: >
  Atomics.xor.name is "xor".
includes: [propertyHelper.js]
---*/

assert.sameValue(Atomics.xor.name, "xor");

verifyNotEnumerable(Atomics.xor, "name");
verifyNotWritable(Atomics.xor, "name");
verifyConfigurable(Atomics.xor, "name");
