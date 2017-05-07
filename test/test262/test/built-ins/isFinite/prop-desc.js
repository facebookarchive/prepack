// Copyright (C) 2016 The V8 Project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-isfinite-number
es6id: 18.2.2
description: >
  Property descriptor for isFinite
includes: [propertyHelper.js]
---*/

verifyNotEnumerable(this, "isFinite");
verifyWritable(this, "isFinite");
verifyConfigurable(this, "isFinite");
