// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

export { A as B } from './instn-iee-bndng-cls.js';

// Taken together, the following two assertions demonstrate that there is no
// entry in the environment record for ImportName:
assert.throws(ReferenceError, function() {
  A;
});
assert.sameValue(typeof A, 'undefined');

// Taken together, the following two assertions demonstrate that there is no
// entry in the environment record for ExportName:
assert.throws(ReferenceError, function() {
  B;
});
assert.sameValue(typeof B, 'undefined');
