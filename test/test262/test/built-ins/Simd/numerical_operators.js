// Copyright (C) 2016 ecmascript_simd authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: constructor-properties
description: Tests the SIMD numerical operations.
includes: [simdUtilities.js]
---*/

simdTypes.filter(isNumerical).forEach(function(type) {
  testSimdFunction(type.name + ' equal', function() {
    testRelationalOp(type, 'equal', function(a, b) { return a == b; });
  });
  testSimdFunction(type.name + ' notEqual', function() {
    testRelationalOp(type, 'notEqual', function(a, b) { return a != b; });
  });
  testSimdFunction(type.name + ' lessThan', function() {
    testRelationalOp(type, 'lessThan', function(a, b) { return a < b; });
  });
  testSimdFunction(type.name + ' lessThanOrEqual', function() {
    testRelationalOp(type, 'lessThanOrEqual', function(a, b) {
      return a <= b;
    });
  });
  testSimdFunction(type.name + ' greaterThan', function() {
    testRelationalOp(type, 'greaterThan', function(a, b) { return a > b; });
  });
  testSimdFunction(type.name + ' greaterThanOrEqual', function() {
    testRelationalOp(type, 'greaterThanOrEqual', function(a, b) { return a >= b; });
  });
  testSimdFunction(type.name + ' add', function() {
    testBinaryOp(type, 'add', function(a, b) { return a + b; });
  });
  testSimdFunction(type.name + ' sub', function() {
    testBinaryOp(type, 'sub', function(a, b) { return a - b; });
  });
  testSimdFunction(type.name + ' mul', function() {
    testBinaryOp(type, 'mul', type.mulFn);
  });
});
