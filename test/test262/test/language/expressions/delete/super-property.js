// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-delete-operator-runtime-semantics-evaluation
es6id: 12.5.4.2
description: SuperReferences may not be deleted
info: |
  [...]
  5.If IsPropertyReference(ref) is true, then
    a. If IsSuperReference(ref) is true, throw a ReferenceError exception.
features: [class]
---*/

var caught;

class C extends Object {
  constructor() {
    try {
      delete super.x;
    } catch (err) {
      caught = err;
    }
  }
}

// When the "construct" invocation completes and the "this" value is
// uninitialized, the specification dictates that a ReferenceError must be
// thrown. That behavior is tested elsewhere, so the error is ignored (if it is
// produced at all).
try {
  new C();
} catch (_) {}

assert.sameValue(typeof caught, 'object');
assert.sameValue(caught.constructor, ReferenceError);
