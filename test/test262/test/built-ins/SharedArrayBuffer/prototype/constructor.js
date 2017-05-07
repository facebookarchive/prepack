// Copyright (C) 2015 André Bargull. All rights reserved.
// Copyright (C) 2017 Mozilla Corporation. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
description: >
  The `SharedArrayBuffer.prototype.constructor` property descriptor.
includes: [propertyHelper.js]
---*/

assert.sameValue(SharedArrayBuffer.prototype.constructor, SharedArrayBuffer);

verifyNotEnumerable(SharedArrayBuffer.prototype, "constructor");
verifyWritable(SharedArrayBuffer.prototype, "constructor");
verifyConfigurable(SharedArrayBuffer.prototype, "constructor");
