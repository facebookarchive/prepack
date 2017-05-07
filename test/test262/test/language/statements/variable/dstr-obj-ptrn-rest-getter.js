// This file was procedurally generated from the following sources:
// - src/dstr-binding/obj-ptrn-rest-getter.case
// - src/dstr-binding/default/var-stmt.template
/*---
description: Getter is called when obj is being deconstructed to a rest Object (`var` statement)
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
var count = 0;

var {...x} = { get v() { count++; return 2; } };

assert.sameValue(x.v, 2);
assert.sameValue(count, 1);

verifyEnumerable(x, "v");
verifyWritable(x, "v");
verifyConfigurable(x, "v");

