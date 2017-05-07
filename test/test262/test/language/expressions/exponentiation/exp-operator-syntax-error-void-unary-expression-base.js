// Copyright (C) 2016 Rick Waldron. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.

/*---
author: Rick Waldron
esid: sec-unary-operators
description: Exponentiation Expression syntax error, `void` UnaryExpression
info: >
  ExponentiationExpression :
    UnaryExpression
    ...

  UnaryExpression :
    ...
    `void` UnaryExpression
    ...

negative:
  phase: early
  type: SyntaxError
---*/
void 1 ** 2;
