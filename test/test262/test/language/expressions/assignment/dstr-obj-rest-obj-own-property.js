// This file was procedurally generated from the following sources:
// - src/dstr-assignment/obj-rest-obj-own-property.case
// - src/dstr-assignment/default/assignment-expr.template
/*---
description: Rest object contains just source object's own properties (AssignmentExpression)
esid: sec-variable-statement-runtime-semantics-evaluation
es6id: 13.3.2.4
features: [object-rest, destructuring-binding]
flags: [generated]
info: |
    VariableDeclaration : BindingPattern Initializer

    1. Let rhs be the result of evaluating Initializer.
    2. Let rval be GetValue(rhs).
    3. ReturnIfAbrupt(rval).
    4. Return the result of performing BindingInitialization for
       BindingPattern passing rval and undefined as arguments.
---*/
var o = Object.create({ x: 1, y: 2 });
o.z = 3;

var x, y, z;

var result;
var vals = o;

result = { x, ...{y , z} } = vals;

assert.sameValue(x, 1);
assert.sameValue(y, undefined);
assert.sameValue(z, 3);


assert.sameValue(result, vals);
