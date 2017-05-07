// Copyright 2017 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
author: Caitlin Potter <caitp@igalia.com>
esid: pending
description: >
  Async generator function expressions are not a simple assignment target.
negative:
  phase: early
  type: ReferenceError
features: [async-iteration]
---*/

(async function*() { } = 1);
