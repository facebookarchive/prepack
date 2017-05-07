// Copyright (C) 2016 ecmascript_simd authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: shuffle
description: Tests SIMD shuffle.
includes: [simdUtilities.js]
---*/

function testShuffle(type) {
  assert.sameValue('function', typeof type.fn.shuffle);
  var indices = [];
  for (var i = 0; i < type.lanes; i++) indices.push(i);

  var a = type.fn.apply(type.fn, indices);            // 0, 1, 2, 3, 4 ...
  var b = type.fn.add(a, type.fn.splat(type.lanes));  // lanes, lanes+1 ...
  // All lanes from a.
  var result = type.fn.shuffle.apply(type.fn, [a, b].concat(indices));
  checkValue(type, result, function(index) {
    return type.fn.extractLane(a, index);
  });
  // One lane from b.
  for (var i = 0; i < type.lanes; i++) {
    var args = [a, b].concat(indices);
    args[2 + i] += type.lanes;
    var result = type.fn.shuffle.apply(type.fn, args);
    checkValue(type, result, function(index) {
      var val = index == i ? b : a;
      return type.fn.extractLane(val, index);
    });
  }
  // All lanes from b.
  for (var i = 0; i < type.lanes; i++) indices[i] += type.lanes;
  var result = type.fn.shuffle.apply(type.fn, [a, b].concat(indices));
  checkValue(type, result, function(index) {
    return type.fn.extractLane(b, index);
  });

  function testIndexCheck(index, err) {
    for (var i = 0; i < type.lanes; i++) {
      var args = [a, b].concat(indices);
      args[i + 2] = index;
      assert.throws(err, function() { type.fn.shuffle.apply(type.fn, args); });
    }
  }
  testIndexCheck(2 * type.lanes, RangeError);
  testIndexCheck(13.37, TypeError);
  testIndexCheck(undefined, TypeError);
  testIndexCheck({}, TypeError);
  testIndexCheck('yo', TypeError);
  testIndexCheck(-1, RangeError);
  testIndexCheck(128, RangeError);
}

simdTypes.filter(isNumerical).forEach(function(type) {
  testSimdFunction(type.name + ' shuffle', function() {
    testShuffle(type);
  });
});
