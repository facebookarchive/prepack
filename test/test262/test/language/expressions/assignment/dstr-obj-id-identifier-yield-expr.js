// This file was procedurally generated from the following sources:
// - src/dstr-assignment/obj-id-identifier-yield-expr.case
// - src/dstr-assignment/syntax/assignment-expr.template
/*---
description: yield is not a valid IdentifierReference in an AssignmentProperty within generator function bodies. (AssignmentExpression)
esid: sec-variable-statement-runtime-semantics-evaluation
es6id: 13.3.2.4
features: [generators, destructuring-binding]
flags: [generated, noStrict]
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
(function*() {

0, { yield } = {};

});
