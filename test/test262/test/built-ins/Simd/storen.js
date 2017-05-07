// Copyright (C) 2016 ecmascript_simd authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: simd-store-in-tarray
description: Tests Simdstore functions.
includes: [simdUtilities.js]
---*/

function testStore(type, name, count) {
  var storeFn = type.fn[name];
  assert.sameValue('function', typeof storeFn);
  var bufLanes = 2 * type.lanes;  // Test all alignments.
  var bufSize = bufLanes * type.laneSize + 8;  // Extra for over-alignment test.
  var ab = new ArrayBuffer(bufSize);
  var buf = new type.view(ab);
  var a = createTestValue(type); // Value containing 0, 1, 2, 3 ...
  function checkBuffer(offset) {
    for (var i = 0; i < count; i++)
      if (buf[offset + i] != i) return false;
    return true;
  }
  // Test aligned stores.
  for (var i = 0; i < type.lanes; i++) {
    assert.sameValue(storeFn(buf, i, a), a);
    assert(checkBuffer(i));
  }
  // Test the 2 over-alignments.
  var f64 = new Float64Array(ab);
  var stride = 8 / type.laneSize;
  for (var i = 0; i < 1; i++) {
    assert.sameValue(storeFn(f64, i, a), a);
    assert(checkBuffer(stride * i));
  }
  // Test the 7 mis-alignments.
  var i8 = new Int8Array(ab);
  for (var misalignment = 1; misalignment < 8; misalignment++) {
    assert.sameValue(storeFn(i8, misalignment, a), a);
    // Shift the buffer down by misalignment.
    for (var i = 0; i < i8.length - misalignment; i++)
      i8[i] = i8[i + misalignment];
    assert(checkBuffer(0));
  }

  //Test index coercions
  storeFn(buf, "0", a);
  assert(checkBuffer(0));
  storeFn(buf, "01", a);
  assert(checkBuffer(1));
  storeFn(buf, " -0.0 ", a);
  assert(checkBuffer(0));
  storeFn(buf, " +1e0", a);
  assert(checkBuffer(1));
  storeFn(buf, false, a);
  assert(checkBuffer(0));
  storeFn(buf, true, a);
  assert(checkBuffer(1));
  storeFn(buf, null, a);
  assert(checkBuffer(0));

  function testIndexCheck(buf, index, err) {
    assert.throws(err, function () { storeFn(buf, index, type.fn()); });
  }
  testIndexCheck(buf, -1, RangeError);
  testIndexCheck(buf, bufSize / type.laneSize - count + 1, RangeError);
  testIndexCheck(buf.buffer, 1, TypeError);
  testIndexCheck(buf, "a", RangeError);
}

simdTypes.filter(isNumerical).forEach(function(type) {
  testSimdFunction(type.name + ' store', function() {
    testStore(type, 'store', type.lanes);
  });
});

simdTypes.filter(hasLoadStore123).forEach(function(type) {
  testSimdFunction(type.name + ' store1', function() {
    testStore(type, 'store1', 1);
  });
  testSimdFunction(type.name + ' store1', function() {
    testStore(type, 'store2', 2);
  });
  testSimdFunction(type.name + ' store3', function() {
    testStore(type, 'store3', 3);
  });
});
