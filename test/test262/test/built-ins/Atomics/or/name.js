// Copyright (C) 2015 André Bargull. All rights reserved.
// Copyright (C) 2017 Mozilla Corporation. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
description: >
  Atomics.or.name is "or".
includes: [propertyHelper.js]
---*/

assert.sameValue(Atomics.or.name, "or");

verifyNotEnumerable(Atomics.or, "name");
verifyNotWritable(Atomics.or, "name");
verifyConfigurable(Atomics.or, "name");
