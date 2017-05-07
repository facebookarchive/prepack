// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-dataview-constructor
es6id: 24.2.2
description: >
  The name property of DataView is "DataView"
includes: [propertyHelper.js]
---*/

assert.sameValue(DataView.name, "DataView", "The value of `DataView.name` is `'DataView'`");

verifyNotEnumerable(DataView, "name");
verifyNotWritable(DataView, "name");
verifyConfigurable(DataView, "name");
