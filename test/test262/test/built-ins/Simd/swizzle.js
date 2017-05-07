// Copyright (C) 2016 ecmascript_simd authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: swizzle
description: Tests Simd swizzle.
includes: [simdUtilities.js]
---*/

function testSwizzle(type) {
  assert.sameValue('function', typeof type.fn.swizzle);
  var a = createTestValue(type);  // 0, 1, 2, 3, 4, 5, 6, ...
  var indices = [];
  // Identity swizzle.
  for (var i = 0; i < type.lanes; i++) indices.push(i);
  var result = type.fn.swizzle.apply(type.fn, [a].concat(indices));
  checkValue(type, result, function(index) {
    return type.fn.extractLane(a, index);
  });
  // Reverse swizzle.
  indices.reverse();
  var result = type.fn.swizzle.apply(type.fn, [a].concat(indices));
  checkValue(type, result, function(index) {
    return type.fn.extractLane(a, type.lanes - index - 1);
  });

  function testIndexCheck(index, err) {
    for (var i = 0; i < type.lanes; i++) {
      var args = [a].concat(indices);
      args[i + 1] = index;
      assert.throws(err, function() { type.fn.swizzle.apply(type.fn, args); });
    }
  }
  // RangeError
  testIndexCheck(type.lanes, RangeError);
  testIndexCheck(-1, RangeError);
  testIndexCheck(128, RangeError);
  testIndexCheck(13.37, TypeError);
  testIndexCheck(undefined, TypeError);
  testIndexCheck({}, TypeError);
  testIndexCheck('yo', TypeError);
}

simdTypes.filter(isNumerical).forEach(function(type) {
  testSimdFunction(type.name + ' swizzle', function() {
    testSwizzle(type);
  });
});
