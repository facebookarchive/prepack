// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
description: Literal may not contain an unrecognized flag (early error)
esid: sec-primary-expression-regular-expression-literals-static-semantics-early-errors
info: >
    It is a Syntax Error if FlagText of RegularExpressionLiteral contains any
    code points other than "g", "i", "m", "u", or "y", or if it contains the
    same code point more than once.
negative:
  phase: early
  type: SyntaxError
---*/

throw new Test262Error();

/./G;
