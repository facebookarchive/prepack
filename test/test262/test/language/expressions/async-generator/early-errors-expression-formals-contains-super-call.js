// Copyright 2017 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
author: Caitlin Potter <caitp@igalia.com>
esid: pending
description: >
  It is a syntax error if FormalParameters contains SuperCall is true.
negative:
  phase: early
  type: SyntaxError
features: [async-iteration]
---*/

(async function*(a = super()) { });
