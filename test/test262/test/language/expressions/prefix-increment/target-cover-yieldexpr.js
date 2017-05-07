// Copyright (C) 2016 the V8 project authors. All rights reserved.
// This code is governed by the BSD license found in the LICENSE file.
/*---
esid: sec-unary-operators-static-semantics-early-errors
es6id: 12.5.1
description: Applied to a "covered" YieldExpression
info: |
  UnaryExpression :
    ++ UnaryExpression
    -- UnaryExpression

  - It is an early Reference Error if IsValidSimpleAssignmentTarget of
    UnaryExpression is false.

  12.15.3 Static Semantics: IsValidSimpleAssignmentTarget

  AssignmentExpression:
    YieldExpression
    ArrowFunction
    LeftHandSideExpression = AssignmentExpression
    LeftHandSideExpression AssignmentOperator AssignmentExpression

  1. Return false.
features: [generators]
negative:
  phase: early
  type: ReferenceError
---*/

function* g() {
  ++(yield);
}
