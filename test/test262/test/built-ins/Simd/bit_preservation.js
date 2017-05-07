// Copyright (C) 2016 ecmascript_simd authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: pending
description: Tests SIMD load and store bit preservation.
includes: [simdUtilities.js]
---*/

testSimdFunction('Float32x4 Int32x4 load/store bit preservation', function() {
   // NaNs should stay unmodified when storing and loading to Float32Array
  var taf32 = new Float32Array(4);
  var tai32 = new Int32Array(4);
  var i4a, i4b;
  i4a = SIMD.Int32x4(0x7fc00000,0x7fe00000,0x7ff00000,0x7ff80000);
  SIMD.Int32x4.store(taf32, 0, i4a);
  i4b = SIMD.Int32x4.load(taf32, 0);
  equalInt32x4(i4a, i4b);

  // NaNs should stay unmodified when loading as Float32x4 and
  // storing as Int32x4
  SIMD.Int32x4.store(taf32, 0, i4a);
  var f4 = SIMD.Float32x4.load(taf32, 0);
  SIMD.Float32x4.store(tai32, 0, f4);
  i4b = SIMD.Int32x4.load(tai32, 0);
  equalInt32x4(i4a, i4b);
});
