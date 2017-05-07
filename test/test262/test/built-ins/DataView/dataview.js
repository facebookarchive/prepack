// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-dataview-constructor
es6id: 24.2.2
description: >
  The DataView Constructor
includes: [propertyHelper.js]
---*/

verifyNotEnumerable(this, "DataView");
verifyWritable(this, "DataView");
verifyConfigurable(this, "DataView");
