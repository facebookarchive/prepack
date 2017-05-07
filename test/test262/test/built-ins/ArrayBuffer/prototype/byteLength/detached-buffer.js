// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
es6id: 24.1.4.1
esid: sec-get-arraybuffer.prototype.bytelength
description: Returns 0 if the buffer is detached
info: >
  24.1.4.1 get ArrayBuffer.prototype.byteLength

  1. Let O be the this value.
  ...
  4. If IsDetachedBuffer(O) is true, throw a TypeError exception.
  ...
includes: [detachArrayBuffer.js]
---*/

var ab = new ArrayBuffer(1);

$DETACHBUFFER(ab);

assert.throws(TypeError, function() {
  ab.byteLength;
});
