// Copyright (C) 2016 ecmascript_simd authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: simd-check
description: Checks if a SIMDTypeDescriptor is not a SIMDDescriptor.
includes: [simdUtilities.js]
---*/

function testCheck(type) {
  assert.sameValue('function', typeof type.fn.check);
  // Other SIMD types shouldn't check for this type.
  var a = type.fn();
  for (var otherType of simdTypes) {
    if (otherType === type) {
      var result = type.fn.check(a);
      checkValue(type, result, function(index) {
        return type.fn.extractLane(a, index);
      });
      assert.sameValue(a, type.fn.check(a));
    } else {
      assert.throws(TypeError, function() { otherType.check(a); });
    }
  }
  // Neither should other types.
  for (var x of [ {}, "", 0, 1, true, false, undefined, null, NaN, Infinity]) {
    assert.throws(TypeError, function() { type.fn.check(x); });
  }
}

simdTypes.forEach(function(type) {
  testSimdFunction(type.name + ' check', function() {
    testCheck(type);
  });
});
