// Copyright (C) 2016 Jordan Harband. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
description: Object.getOwnPropertyDescriptors on a proxy with duplicate ownKeys should work
esid: sec-object.getownpropertydescriptors
author: Jordan Harband
features: [Proxy]
---*/

var i = 0;
var descriptors = [
  { enumerable: false, value: "A1", writable: true, configurable: true },
  { enumerable: true, value: "A2", writable: true, configurable: true }
];
var log = '';
var proxy = new Proxy({}, {
  ownKeys() {
    log += 'ownKeys|';
    return ['DUPLICATE', 'DUPLICATE', 'DUPLICATE'];
  },
  getOwnPropertyDescriptor(t, name) {
    log += 'getOwnPropertyDescriptor:' + name + '|';
    return descriptors[i++];
  }
});

var result = Object.getOwnPropertyDescriptors(proxy);
assert.sameValue(result.hasOwnProperty('DUPLICATE'), true);

var lastDescriptor = descriptors[descriptors.length - 1];
assert.notSameValue(result.DUPLICATE, lastDescriptor);
assert.sameValue(result.DUPLICATE.enumerable, lastDescriptor.enumerable);
assert.sameValue(result.DUPLICATE.configurable, lastDescriptor.configurable);
assert.sameValue(result.DUPLICATE.value, lastDescriptor.value);
assert.sameValue(result.DUPLICATE.writable, lastDescriptor.writable);

assert.sameValue(log, 'ownKeys|getOwnPropertyDescriptor:DUPLICATE|getOwnPropertyDescriptor:DUPLICATE|getOwnPropertyDescriptor:DUPLICATE|');
