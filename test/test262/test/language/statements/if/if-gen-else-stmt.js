// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
description: Generator declaration not allowed in statement position
esid: sec-if-statement
es6id: 13.6
negative:
  phase: early
  type: SyntaxError
---*/

if (true) function* g() {  } else ;
