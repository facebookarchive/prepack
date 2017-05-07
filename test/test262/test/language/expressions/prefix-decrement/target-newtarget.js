// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-unary-operators-static-semantics-early-errors
es6id: 12.5.1
description: Applied to new.target
info: |
  UnaryExpression :
    ++ UnaryExpression
    -- UnaryExpression

  - It is an early Reference Error if IsValidSimpleAssignmentTarget of
    UnaryExpression is false.

  12.3.1.5 Static Semantics: IsValidSimpleAssignmentTarget

  NewTarget:

  new.target

  1. Return false.
negative:
  phase: early
  type: ReferenceError
---*/

function f() {
  --new.target;
}
