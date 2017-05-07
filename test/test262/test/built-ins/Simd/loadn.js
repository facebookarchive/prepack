// Copyright (C) 2016 ecmascript_simd authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: simd-load-from-tarray
description: Tests SIMD load functions.
includes: [simdUtilities.js]
---*/

function testLoad(type, name, count) {
  var loadFn = type.fn[name];
  assert.sameValue('function', typeof loadFn);
  var bufLanes = 2 * type.lanes;  // Test all alignments.
  var bufSize = bufLanes * type.laneSize + 8;  // Extra for over-alignment test.
  var ab = new ArrayBuffer(bufSize);
  var buf = new type.view(ab);
  for (var i = 0; i < bufLanes; i++) buf[i] = i; // Number buffer sequentially.
  // Test aligned loads.
  for (var i = 0; i < type.lanes; i++) {
    var a = loadFn(buf, i);
    checkValue(type, a, function(index) {
      return index < count ? i + index : 0;
    });
  }

  // Test index coercions
  // Unlike typedArray[index], non-canonical strings are allowed here.
  checkValue(type, loadFn(buf, "0"),
      function(index) { return index < count ? index : 0; });
  checkValue(type, loadFn(buf, " -0.0 "),
      function(index) { return index < count ? index : 0; });
  checkValue(type, loadFn(buf, "00"),
      function(index) { return index < count ? index : 0; });
  checkValue(type, loadFn(buf, false),
      function(index) { return index < count ? index : 0; });
  checkValue(type, loadFn(buf, null),
      function(index) { return index < count ? index : 0; });
  checkValue(type, loadFn(buf, "01"),
      function(index) { return index < count ? 1 + index : 0; });
  checkValue(type, loadFn(buf, " +1e0"),
      function(index) { return index < count ? 1 + index : 0; });
  checkValue(type, loadFn(buf, true),
      function(index) { return index < count ? 1 + index : 0; });

  // Test the 2 possible over-alignments.
  var f64 = new Float64Array(ab);
  var stride = 8 / type.laneSize;
  for (var i = 0; i < 1; i++) {
    var a = loadFn(f64, i);
    checkValue(type, a, function(index) {
      return index < count ? stride * i + index : 0;
    });
  }
  // Test the 7 possible mis-alignments.
  var i8 = new Int8Array(ab);
  for (var misalignment = 1; misalignment < 8; misalignment++) {
    // Shift the buffer up by 1 byte.
    for (var i = i8.length - 1; i > 0; i--)
      i8[i] = i8[i - 1];
    var a = loadFn(i8, misalignment);
    checkValue(type, a, function(index) {
      return index < count ? i + index : 0;
    });
  }

  function testIndexCheck(buf, index, err) {
    assert.throws(err, function () { loadFn(buf, index); });
  }
  testIndexCheck(buf, -1, RangeError);
  testIndexCheck(buf, 0.7, RangeError);
  testIndexCheck(buf, -0.1, RangeError);
  testIndexCheck(buf, NaN, RangeError);
  testIndexCheck(buf, bufSize / type.laneSize - count + 1, RangeError);
  testIndexCheck(buf.buffer, 1, TypeError);
  testIndexCheck(buf, "a", RangeError);
}

simdTypes.filter(isNumerical).forEach(function(type) {
  testSimdFunction(type.name + ' load', function() {
    testLoad(type, 'load', type.lanes);
  });
});

simdTypes.filter(hasLoadStore123).forEach(function(type) {
  testSimdFunction(type.name + ' load1', function() {
    testLoad(type, 'load1', 1);
  });
  testSimdFunction(type.name + ' load2', function() {
    testLoad(type, 'load2', 2);
  });
  testSimdFunction(type.name + ' load3', function() {
    testLoad(type, 'load3', 3);
  });
});
