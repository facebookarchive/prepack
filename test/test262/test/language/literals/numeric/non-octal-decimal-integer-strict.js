// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-additional-syntax-numeric-literals
es6id: B1.1
description: NonOctalDecimalIntegerLiteral is not enabled in strict mode code
info: >
     DecimalIntegerLiteral ::
       0
       NonZeroDigit DecimalDigits[opt]
       NonOctalDecimalIntegerLiteral

     NonOctalDecimalIntegerLiteral ::
       0 NonOctalDigit
       LegacyOctalLikeDecimalIntegerLiteral NonOctalDigit
       NonOctalDecimalIntegerLiteral DecimalDigit

     LegacyOctalLikeDecimalIntegerLiteral ::
       0 OctalDigit
       LegacyOctalLikeDecimalIntegerLiteral OctalDigit

     NonOctalDigit :: one of
       8 9
flags: [onlyStrict]
negative:
  phase: early
  type: SyntaxError
---*/

08;
