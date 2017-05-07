// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-assignment-operators-static-semantics-early-errors
es6id: 12.14.1
description: Applied to new.target
info: |
  AssignmentExpression : LeftHandSideExpression = AssignmentExpression

  - It is an early Reference Error if LeftHandSideExpression is neither an
    ObjectLiteral nor an ArrayLiteral and IsValidSimpleAssignmentTarget of
    LeftHandSideExpression is false.

  12.3.1.5 Static Semantics: IsValidSimpleAssignmentTarget

  NewTarget:

  new.target

  1. Return false.
negative:
  phase: early
  type: ReferenceError
---*/

function f() {
  new.target = 1;
}
