// Copyright 2016 Microsoft, Inc. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
author: Brian Terlson <brian.terlson@microsoft.com>
esid: pending
description: >
  %AsyncFunction% has a length of 1 with writable false, enumerable false, configurable true.
includes: [propertyHelper.js]
---*/

var AsyncFunction = async function foo() { }.constructor;
assert.sameValue(AsyncFunction.length, 1);
verifyNotWritable(AsyncFunction, 'length');
verifyNotEnumerable(AsyncFunction, 'length');
verifyConfigurable(AsyncFunction, 'length');
