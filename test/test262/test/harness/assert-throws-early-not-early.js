// Copyright (C) 2017 Mozilla Corporation. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
description: >
    The assertion fails when the code does not parse with an early error
---*/

// monkeypatch the API
$ERROR = function $ERROR(message) {
  throw new Test262Error(message);
};

assert.throws(Test262Error, () => {
  assert.throws.early(ReferenceError, 'x = 1');
});
