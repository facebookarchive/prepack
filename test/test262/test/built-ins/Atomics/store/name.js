// Copyright (C) 2015 André Bargull. All rights reserved.
// Copyright (C) 2017 Mozilla Corporation. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
description: >
  Atomics.store.name is "store".
includes: [propertyHelper.js]
---*/

assert.sameValue(Atomics.store.name, "store");

verifyNotEnumerable(Atomics.store, "name");
verifyNotWritable(Atomics.store, "name");
verifyConfigurable(Atomics.store, "name");
