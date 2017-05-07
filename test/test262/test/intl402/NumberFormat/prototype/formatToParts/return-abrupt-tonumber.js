// Copyright 2016 Mozilla Corporation. All rights reserved.
// This code is governed by the license found in the LICENSE file.
//
/*---
description: >
  Return abrupt completions from ToNumber(date)
info: |
  Intl.NumberFormat.prototype.formatToParts ([ value ])

  5. Let _x_ be ? ToNumber(_value_).
features: [Symbol]
---*/

var obj1 = {
  valueOf: function() {
    throw new Test262Error();
  }
};

var obj2 = {
  toString: function() {
    throw new Test262Error();
  }
};

var nf = new Intl.NumberFormat(["pt-BR"]);

assert.throws(Test262Error, function() {
  nf.formatToParts(obj1);
}, "valueOf");

assert.throws(Test262Error, function() {
  nf.formatToParts(obj2);
}, "toString");

var s = Symbol('1');
assert.throws(TypeError, function() {
  nf.formatToParts(s);
}, "symbol");

