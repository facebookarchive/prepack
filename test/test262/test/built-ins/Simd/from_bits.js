// Copyright (C) 2016 ecmascript_simd authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: simd-to-timd
description: From<type>Bits functions.
includes: [simdUtilities.js]
---*/

function testFromBits(toType, fromType, name) {
  assert.sameValue('function', typeof toType.fn[name]);
  for (var v of fromType.interestingValues) {
    var fromValue = createSplatValue(fromType, v);
    var result = toType.fn[name](fromValue);
    for (var i = 0; i < fromType.lanes; i++)
      fromType.buffer[i] = fromType.fn.extractLane(fromValue, i);
    checkValue(toType, result, function(index) {
      return toType.buffer[index];
    });
  }
}

simdTypes.forEach(function(toType) {
  if (!toType.fromBits) return;
  for (var fromType of toType.fromBits) {
    var fn = 'from' + fromType.name + 'Bits';
    testSimdFunction(toType.name + ' ' + fn, function() {
      testFromBits(toType, fromType, fn);
    });
  }
});
