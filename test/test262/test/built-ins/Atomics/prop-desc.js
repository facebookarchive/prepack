// Copyright (C) 2016 The V8 Project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
description: >
  Property descriptor of Atomics
info: |
  The Atomics Object

  [...]
  The Atomics object is not a function object. It does not have a [[Construct]]
  internal method; it is not possible to use the Atomics object as a constructor
  with the new operator. The Atomics object also does not have a [[Call]] internal
  method; it is not possible to invoke the Atomics object as a function.

  17 ECMAScript Standard Built-in Objects:

  Every other data property described in clauses 18 through 26 and in Annex B.2
  has the attributes { [[Writable]]: true, [[Enumerable]]: false,
  [[Configurable]]: true } unless otherwise specified.
includes: [propertyHelper.js]
---*/

assert.sameValue(typeof Atomics, "object", "no [[Call]]");
assert.throws(TypeError, function() {
  new Atomics();
}, "no [[Construct]]");

verifyNotEnumerable(this, "Atomics");
verifyWritable(this, "Atomics");
verifyConfigurable(this, "Atomics");
