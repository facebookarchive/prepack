// Copyright (C) 2015 André Bargull. All rights reserved.
// Copyright (C) 2017 Mozilla Corporation. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
description: >
  Atomics.compareExchange.name is "compareExchange".
includes: [propertyHelper.js]
---*/

assert.sameValue(Atomics.compareExchange.name, "compareExchange");

verifyNotEnumerable(Atomics.compareExchange, "name");
verifyNotWritable(Atomics.compareExchange, "name");
verifyConfigurable(Atomics.compareExchange, "name");
