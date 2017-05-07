// Copyright (C) 2016 ecmascript_simd authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: simd-wrapper
description: Test the constructor and splat with the given lane values.
includes: [simdUtilities.js]
---*/

function testConstructor(type) {
  assert.sameValue('function', typeof type.fn);
  assert.sameValue('function', typeof type.fn.splat);
  for (var v of type.interestingValues) {
    var expected = simdConvert(type, v);
    var result = createSplatValue(type, v);
    checkValue(type, result, function(index) { return expected; });
    // splat.
    result = type.fn.splat(v);
    checkValue(type, result, function(index) { return expected; });
  }
}

simdTypes.forEach(function(type) {
  testSimdFunction(type.name + ' constructor', function() {
    testConstructor(type);
  });
});
