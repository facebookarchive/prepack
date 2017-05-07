// Copyright (C) 2017 Mozilla Corporation.  All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
description: >
    `Symbol.toStringTag` property descriptor on Atomics
info: >
    The initial value of the @@toStringTag property is the String value
    "Atomics".

    This property has the attributes { [[Writable]]: false, [[Enumerable]]:
    false, [[Configurable]]: true }.
includes: [propertyHelper.js]
features: [Symbol.toStringTag]
---*/

assert.sameValue(Atomics[Symbol.toStringTag], 'Atomics');

verifyNotEnumerable(Atomics, Symbol.toStringTag);
verifyNotWritable(Atomics, Symbol.toStringTag);
verifyConfigurable(Atomics, Symbol.toStringTag);
