// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-additional-syntax-numeric-literals
es6id: B1.1
description: LegacyOctalIntegerLiteral is not enabled in strict mode code
info: >
    NumericLiteral ::
      DecimalLiteral
      BinaryIntegerLiteral
      OctalIntegerLiteral
      HexIntegerLiteral
      LegacyOctalIntegerLiteral

     LegacyOctalIntegerLiteral ::
       0 OctalDigit
       LegacyOctalIntegerLiteral OctalDigit
flags: [onlyStrict]
negative:
  phase: early
  type: SyntaxError
---*/

00;
