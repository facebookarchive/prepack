// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
description: Literal may not describe an invalid pattern (early error)
esid: sec-primary-expression-regular-expression-literals-static-semantics-early-errors
info: >
    It is a Syntax Error if BodyText of RegularExpressionLiteral cannot be
    recognized using the goal symbol Pattern of the ECMAScript RegExp grammar
    specified in 21.2.1.
negative:
  phase: early
  type: SyntaxError
---*/

throw new Test262Error();

/?/;
