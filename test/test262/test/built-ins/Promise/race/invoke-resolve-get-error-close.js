// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
description: >
  Error retrieving the constructor's `resolve` method (iterator closing)
esid: sec-promise.race
es6id: 25.4.4.3
info: |
    11. Let result be PerformPromiseRace(iteratorRecord, C, promiseCapability).
    12. If result is an abrupt completion,
        a. If iteratorRecord.[[done]] is false, let result be
           IteratorClose(iterator, result).
        b. IfAbruptRejectPromise(result, promiseCapability).

    [...]

    25.4.4.3.1 Runtime Semantics: PerformPromiseRace

    1. Repeat
        [...]
        h. Let nextPromise be Invoke(C, "resolve", «nextValue»).
        i. ReturnIfAbrupt(nextPromise).
features: [Symbol.iterator]
---*/

var iter = {};
var returnCount = 0;
iter[Symbol.iterator] = function() {
  return {
    next: function() {
      return { done: false };
    },
    return: function() {
      returnCount += 1;
      return {};
    }
  };
};
Object.defineProperty(Promise, 'resolve', {
  get: function() {
    throw new Test262Error();
  }
});

Promise.race(iter);

assert.sameValue(returnCount, 1);
