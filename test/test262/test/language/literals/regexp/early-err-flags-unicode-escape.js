// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-literals-regular-expression-literals-static-semantics-early-errors
es6id: 11.8.5.1
description: >
  RegularExpressionFlags :: RegularExpressionFlags IdentifierPart

  - It is a Syntax Error if IdentifierPart contains a Unicode escape sequence.
negative:
  phase: early
  type: SyntaxError
---*/

/./\u0067;
