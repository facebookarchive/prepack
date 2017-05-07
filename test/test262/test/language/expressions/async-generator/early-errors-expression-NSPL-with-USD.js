// Copyright 2017 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
author: Caitlin Potter <caitp@igalia.com>
esid: pending
description: >
  It is a Syntax Error if ContainsUseStrict of AsyncGeneratorBody is true and
  IsSimpleParameterList of UniqueFormalParameters is false.
negative:
  phase: early
  type: SyntaxError
features: [async-iteration]
---*/

(async function*(x = 1) {"use strict"});
