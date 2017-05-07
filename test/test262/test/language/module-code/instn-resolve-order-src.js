// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
description: Modules dependencies are resolved in source text order
esid: sec-moduledeclarationinstantiation
negative:
  phase: early
  type: ReferenceError
flags: [module]
---*/

import './instn-resolve-order-src-valid_FIXTURE.js';
import './instn-resolve-order-src-reference_FIXTURE.js';
import './instn-resolve-order-src-syntax_FIXTURE.js';
