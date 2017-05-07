// Copyright (C) 2016 ecmascript_simd authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: simd-neg
description: Tests the unary '-' operation.
includes: [simdUtilities.js]
---*/

simdTypes.filter(isNumerical).forEach(function(type) {
  testSimdFunction(type.name + ' neg', function() {
    testUnaryOp(type, 'neg', function(a) { return -a; });
  });
});
