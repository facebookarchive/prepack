// This file was procedurally generated from the following sources:
// - src/dstr-assignment/obj-rest-not-last-element-invalid.case
// - src/dstr-assignment/syntax/assignment-expr.template
/*---
description: Object rest element needs to be the last AssignmenProperty in ObjectAssignmentPattern. (AssignmentExpression)
esid: sec-variable-statement-runtime-semantics-evaluation
es6id: 13.3.2.4
features: [object-rest, destructuring-binding]
flags: [generated]
negative:
  phase: early
  type: SyntaxError
info: |
    VariableDeclaration : BindingPattern Initializer

    1. Let rhs be the result of evaluating Initializer.
    2. Let rval be GetValue(rhs).
    3. ReturnIfAbrupt(rval).
    4. Return the result of performing BindingInitialization for
       BindingPattern passing rval and undefined as arguments.
---*/
var rest, b;

0, {...rest, b} = {}
;
