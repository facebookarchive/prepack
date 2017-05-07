// Copyright (C) 2015 André Bargull. All rights reserved.
// Copyright (C) 2017 Mozilla Corporation. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
description: >
  Atomics.load.name is "load".
includes: [propertyHelper.js]
---*/

assert.sameValue(Atomics.load.name, "load");

verifyNotEnumerable(Atomics.load, "name");
verifyNotWritable(Atomics.load, "name");
verifyConfigurable(Atomics.load, "name");
