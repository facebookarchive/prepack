// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-super-keyword
es6id: 12.3.5
description: Prototype of active function object must be a constructor
info: |
  [...]
  3. Let func be ? GetSuperConstructor().

  12.3.5.2 Runtime Semantics: GetSuperConstructor

  [...]
  4. Let superConstructor be ? activeFunction.[[GetPrototypeOf]]().
  5. If IsConstructor(superConstructor) is false, throw a TypeError exception.
features: [class]
---*/

var evaluatedArg = false;
var caught;
class C extends Object {
  constructor() {
    try {
      super(evaluatedArg = true);
    } catch (err) {
      caught = err;
    }
  }
}

Object.setPrototypeOf(C, parseInt);

// When the "construct" invocation completes and the "this" value is
// uninitialized, the specification dictates that a ReferenceError must be
// thrown. That behavior is tested elsewhere, so the error is ignored (if it is
// produced at all).
try {
  new C();
} catch (_) {}

assert.sameValue(typeof caught, 'object');
assert.sameValue(caught.constructor, TypeError);
assert.sameValue(
  evaluatedArg, false, 'did not perform ArgumentsListEvaluation'
);
