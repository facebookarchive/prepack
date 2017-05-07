// Copyright (C) 2017 Mozilla Corporation. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
description: >
  Functions that throw values whose constructor does not match the specified
  constructor do not satisfy the assertion.
---*/

// monkeypatch the API
$ERROR = function $ERROR(message) {
  throw new Test262Error(message);
};

assert.throws(Test262Error, () => {
  assert.throws.early(SyntaxError, "1 = 1;");
}, "'1=1' is a ReferenceError");
assert.throws(Test262Error, () => {
  assert.throws.early(ReferenceError, "var;");
}, "'var;' is a SyntaxError");
