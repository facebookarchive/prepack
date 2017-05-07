// Copyright 2016 Microsoft, Inc. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
author: Brian Terlson <brian.terlson@microsoft.com>
esid: pending
description: >
  %AsyncFunction% has a name of "AsyncFunction".
includes: [propertyHelper.js]
---*/

var AsyncFunction = async function foo() { }.constructor;
assert.sameValue(AsyncFunction.name, "AsyncFunction");
verifyNotWritable(AsyncFunction, "name");
verifyNotEnumerable(AsyncFunction, "name");
verifyConfigurable(AsyncFunction, "name");
