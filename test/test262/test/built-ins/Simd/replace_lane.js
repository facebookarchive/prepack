// Copyright (C) 2016 ecmascript_simd authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: simd-abstract-replace-lane
description: Tests SIMD ReplaceLane.
includes: [simdUtilities.js]
---*/

function testReplaceLane(type) {
  assert.sameValue('function', typeof type.fn.replaceLane);
  var a = createTestValue(type);
  for (var v of type.interestingValues) {
    var expected = simdConvert(type, v);
    for (var i = 0; i < type.lanes; i++) {
      var result = type.fn.replaceLane(a, i, v);
      checkValue(type, result,
                 function(index) {
                   return index == i ? expected : type.fn.extractLane(a, index);
                 });
    }
  }

  function testIndexCheck(index, err) {
    assert.throws(err, function() { type.fn.replaceLane(a, index, 0); });
  }
  testIndexCheck(type.lanes, RangeError);
  testIndexCheck(13.37, TypeError);
  testIndexCheck(undefined, TypeError);
  testIndexCheck({}, TypeError);
  testIndexCheck('yo', TypeError);
  testIndexCheck(-1, RangeError);
  testIndexCheck(128, RangeError);
}

simdTypes.forEach(function(type) {
  testSimdFunction(type.name + ' replaceLane', function() {
    testReplaceLane(type);
  });
});
