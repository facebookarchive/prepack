// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-promise.prototype
es6id: 25.4.4.2
description: Property descriptor of 'prototype' property
info: >
  This property has the attributes { [[Writable]]: false, [[Enumerable]]:
  false, [[Configurable]]: false }.
includes: [propertyHelper.js]
---*/

verifyNotEnumerable(Promise, 'prototype');
verifyNotWritable(Promise, 'prototype');
verifyNotConfigurable(Promise, 'prototype');
