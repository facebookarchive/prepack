// Copyright (C) 2016 The V8 Project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
description: >
  The prototype of Atomics is Object.prototype
info: |
  The Atomics Object

  The value of the [[Prototype]] internal slot of the Atomics object is the
  intrinsic object %ObjectPrototype%.
---*/

var proto = Object.getPrototypeOf(Atomics);

assert.sameValue(proto, Object.prototype);
