// Copyright (C) 2016 Jordan Harband. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-other-properties-of-the-global-object-global
description: "'global' should be the global object"
author: Jordan Harband
includes: [propertyHelper.js]
---*/

assert.sameValue(this, global);
assert.sameValue(global.global, global);

assert.sameValue(Array, global.Array);
assert.sameValue(Boolean, global.Boolean);
assert.sameValue(Date, global.Date);
assert.sameValue(Error, global.Error);
assert.sameValue(Function, global.Function);
assert.sameValue(JSON, global.JSON);
assert.sameValue(Math, global.Math);
assert.sameValue(Number, global.Number);
assert.sameValue(RegExp, global.RegExp);
assert.sameValue(String, global.String);

var globalVariable = {};
assert.sameValue(globalVariable, global.globalVariable);
