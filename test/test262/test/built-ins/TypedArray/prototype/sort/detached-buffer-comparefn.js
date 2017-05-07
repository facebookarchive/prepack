// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-%typedarray%.prototype.sort
description: Throws a TypeError if comparefn detaches the object buffer
info: >
  22.2.3.26 %TypedArray%.prototype.sort ( comparefn )

  When the TypedArray SortCompare abstract operation is called with two
  arguments x and y, the following steps are taken:

  ...
  2. If the argument comparefn is not undefined, then
    a. Let v be ? Call(comparefn, undefined, « x, y »).
    b. If IsDetachedBuffer(buffer) is true, throw a TypeError exception.
    ...
  ...
includes: [testTypedArray.js, detachArrayBuffer.js]
---*/

testWithTypedArrayConstructors(function(TA) {
  var sample = new TA(4);
  var calls = 0;
  var comparefn = function() {
    if (calls > 0) {
      throw new Test262Error();
    }
    calls++;
    $DETACHBUFFER(sample.buffer);
  };

  assert.throws(TypeError, function() {
    sample.sort(comparefn);
  });

  assert.sameValue(calls, 1);
});
