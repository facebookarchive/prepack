// Copyright (C) 2016 ecmascript_simd authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: saturate
description: Tests saturate methods.
includes: [simdUtilities.js]
---*/

simdTypes.filter(isSmallIntType).forEach(function(type) {
  function saturate(type, a) {
    if (a < type.minVal) return type.minVal;
    if (a > type.maxVal) return type.maxVal;
    return a;
  }
  testSimdFunction(type.name + ' addSaturate', function() {
    testBinaryOp(type, 'addSaturate', function(a, b) {
      return saturate(type, a + b);
    });
  });
  testSimdFunction(type.name + ' subSaturate', function() {
    testBinaryOp(type, 'subSaturate', function(a, b) {
      return saturate(type, a - b);
    });
  });
});
