// This file was procedurally generated from the following sources:
// - src/dstr-binding/obj-ptrn-rest-obj-nested-rest.case
// - src/dstr-binding/default/var-stmt.template
/*---
description: When DestructuringAssignmentTarget is an object literal, it should be parsed parsed as a DestructuringAssignmentPattern and evaluated as a destructuring assignment and object rest desconstruction is allowed in that case. (`var` statement)
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

var {a, b, ...{c, ...rest}} = {a: 1, b: 2, c: 3, d: 4, e: 5};

assert.sameValue(a, 1);
assert.sameValue(b, 2);
assert.sameValue(c, 3);

assert.sameValue(rest.d, 4);
assert.sameValue(rest.e, 5);

verifyEnumerable(rest, "d");
verifyWritable(rest, "d");
verifyConfigurable(rest, "d");

verifyEnumerable(rest, "e");
verifyWritable(rest, "e");
verifyConfigurable(rest, "e");

