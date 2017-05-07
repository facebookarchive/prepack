// Copyright (C) 2016 ecmascript_simd authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: constructor-properties
description: Test SIMD Logical operations.
includes: [simdUtilities.js]
---*/

simdTypes.filter(isLogical).forEach(function(type) {
  testSimdFunction(type.name + ' and', function() {
    testBinaryOp(type, 'and', function(a, b) { return a & b; });
  });
  testSimdFunction(type.name + ' or', function() {
    testBinaryOp(type, 'or', function(a, b) { return a | b; });
  });
  testSimdFunction(type.name + ' xor', function() {
    testBinaryOp(type, 'xor', function(a, b) { return a ^ b; });
  });
});
