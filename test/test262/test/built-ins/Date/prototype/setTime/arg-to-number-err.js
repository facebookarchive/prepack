// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-date.prototype.settime
es6id: 20.3.4.27
description: Abrupt completion during type coercion of provided argument
info: |
  1. Perform ? thisTimeValue(this value).
  2. Let t be ? ToNumber(time).
---*/

var date = new Date();
var originalValue = date.getTime();
var obj = {
  valueOf: function() {
    throw new Test262Error();
  }
};

assert.throws(Test262Error, function() {
  date.setTime(obj);
});

assert.sameValue(date.getTime(), originalValue);
