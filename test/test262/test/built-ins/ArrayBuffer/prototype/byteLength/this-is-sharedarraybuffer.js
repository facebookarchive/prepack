// Copyright (C) 2017 Mozilla Corporation. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
esid: sec-get-arraybuffer.prototype.bytelength
description: Throws a TypeError exception when `this` is a SharedArrayBuffer
---*/

var getter = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype, "byteLength"
).get;

assert.throws(TypeError, function() {
  var sab = new SharedArrayBuffer(4);
  getter.call(sab);
}, "`this` cannot be a SharedArrayBuffer");
