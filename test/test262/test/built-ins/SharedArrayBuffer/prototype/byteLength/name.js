// Copyright (C) 2015 the V8 project authors. All rights reserved.
// Copyright (C) 2017 Mozilla Corporation. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
description: >
  get SharedArrayBuffer.prototype.byteLength

includes: [propertyHelper.js]
---*/

var descriptor = Object.getOwnPropertyDescriptor(
  SharedArrayBuffer.prototype, 'byteLength'
);

assert.sameValue(
  descriptor.get.name, 'get byteLength',
  'The value of `descriptor.get.name` is `"get byteLength"`'
);

verifyNotEnumerable(descriptor.get, 'name');
verifyNotWritable(descriptor.get, 'name');
verifyConfigurable(descriptor.get, 'name');
