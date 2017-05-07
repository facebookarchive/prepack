// Copyright (C) 2016 ecmascript_simd authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: constructor-properties
description: Test Shift operations.
includes: [simdUtilities.js]
---*/

// Compare shift op's behavior to ref op at each lane.
function testShiftOp(type, op, refOp) {
  assert.sameValue('function', typeof type.fn[op]);
  var zero = type.fn();
  for (var v of type.interestingValues) {
    var s = type.laneSize * 8;
    for (var bits of [-1, 0, 1, 2, s - 1, s, s + 1]) {
      var expected = simdConvert(type, refOp(simdConvert(type, v), bits));
      var a = type.fn.splat(v);
      var result = type.fn[op](a, bits);
      checkValue(type, result, function(index) { return expected; });
    }
  }
}

simdTypes.filter(isIntType).forEach(function(type) {
  testSimdFunction(type.name + ' shiftLeftByScalar', function() {
    function shift(a, bits) {
      bits &= type.laneSize * 8 - 1;
      return a << bits;
    }
    testShiftOp(type, 'shiftLeftByScalar', shift);
  });
});

simdTypes.filter(isSignedIntType).forEach(function(type) {
  testSimdFunction(type.name + ' shiftRightByScalar', function() {
    function shift(a, bits) {
      bits &= type.laneSize * 8 - 1;
      return a >> bits;
    }
    testShiftOp(type, 'shiftRightByScalar', shift);
  });
});

simdTypes.filter(isUnsignedIntType).forEach(function(type) {
  testSimdFunction(type.name + ' shiftRightByScalar', function() {
    function shift(a, bits) {
      bits &= type.laneSize * 8 - 1;
      if (type.laneMask)
        a &= type.laneMask;
      return a >>> bits;
    }
    testShiftOp(type, 'shiftRightByScalar', shift);
  });
});
