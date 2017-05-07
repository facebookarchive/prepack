// This file was procedurally generated from the following sources:
// - src/dstr-binding/obj-ptrn-rest-skip-non-enumerable.case
// - src/dstr-binding/default/const-stmt.template
/*---
description: Rest object doesn't contain non-enumerable properties (`const` statement)
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
var o = {a: 3, b: 4};
Object.defineProperty(o, "x", { value: 4, enumerable: false });

const {...rest} = o;

assert.sameValue(rest.a, 3);
assert.sameValue(rest.b, 4);
assert.sameValue(rest.x, undefined);

verifyEnumerable(rest, "a");
verifyWritable(rest, "a");
verifyConfigurable(rest, "a");

verifyEnumerable(rest, "b");
verifyWritable(rest, "b");
verifyConfigurable(rest, "b");

