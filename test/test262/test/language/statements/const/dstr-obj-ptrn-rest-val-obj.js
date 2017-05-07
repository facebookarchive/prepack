// This file was procedurally generated from the following sources:
// - src/dstr-binding/obj-ptrn-rest-val-obj.case
// - src/dstr-binding/default/const-stmt.template
/*---
description: Rest object contains just unextracted data (`const` statement)
esid: sec-let-and-const-declarations-runtime-semantics-evaluation
es6id: 13.3.1.4
features: [object-rest, destructuring-binding]
flags: [generated]
includes: [propertyHelper.js]
info: |
    LexicalBinding : BindingPattern Initializer

    1. Let rhs be the result of evaluating Initializer.
    2. Let value be GetValue(rhs).
    3. ReturnIfAbrupt(value).
    4. Let env be the running execution context's LexicalEnvironment.
    5. Return the result of performing BindingInitialization for BindingPattern
       using value and env as the arguments.
---*/

const {a, b, ...rest} = {x: 1, y: 2, a: 5, b: 3};

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

