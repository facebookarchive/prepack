// This file was procedurally generated from the following sources:
// - src/dstr-assignment/obj-rest-valid-object.case
// - src/dstr-assignment/default/assignment-expr.template
/*---
description: Rest object contains just unextracted data (AssignmentExpression)
esid: sec-variable-statement-runtime-semantics-evaluation
es6id: 13.3.2.4
features: [object-rest, destructuring-binding]
flags: [generated]
includes: [propertyHelper.js]
info: |
    VariableDeclaration : BindingPattern Initializer

    1. Let rhs be the result of evaluating Initializer.
    2. Let rval be GetValue(rhs).
    3. ReturnIfAbrupt(rval).
    4. Return the result of performing BindingInitialization for
       BindingPattern passing rval and undefined as arguments.
---*/
var rest, a, b;


var result;
var vals = {x: 1, y: 2, a: 5, b: 3};

result = {a, b, ...rest} = vals;

assert.sameValue(rest.x, 1);
assert.sameValue(rest.y, 2);
assert.sameValue(rest.a, undefined);
assert.sameValue(rest.b, undefined);

verifyEnumerable(rest, "x");
verifyWritable(rest, "x");
verifyConfigurable(rest, "x");

verifyEnumerable(rest, "y");
verifyWritable(rest, "y");
verifyConfigurable(rest, "y");


assert.sameValue(result, vals);
