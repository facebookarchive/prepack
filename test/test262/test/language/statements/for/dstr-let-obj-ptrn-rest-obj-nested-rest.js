// This file was procedurally generated from the following sources:
// - src/dstr-binding/obj-ptrn-rest-obj-nested-rest.case
// - src/dstr-binding/default/for-let.template
/*---
description: When DestructuringAssignmentTarget is an object literal, it should be parsed parsed as a DestructuringAssignmentPattern and evaluated as a destructuring assignment and object rest desconstruction is allowed in that case. (for statement)
esid: sec-for-statement-runtime-semantics-labelledevaluation
es6id: 13.7.4.7
features: [object-rest, destructuring-binding]
flags: [generated]
includes: [propertyHelper.js]
info: |
    IterationStatement :
        for ( LexicalDeclaration Expressionopt ; Expressionopt ) Statement

    [...]
    7. Let forDcl be the result of evaluating LexicalDeclaration.
    [...]

    LexicalDeclaration : LetOrConst BindingList ;

    1. Let next be the result of evaluating BindingList.
    2. ReturnIfAbrupt(next).
    3. Return NormalCompletion(empty).

    BindingList : BindingList , LexicalBinding

    1. Let next be the result of evaluating BindingList.
    2. ReturnIfAbrupt(next).
    3. Return the result of evaluating LexicalBinding.

    LexicalBinding : BindingPattern Initializer

    1. Let rhs be the result of evaluating Initializer.
    2. Let value be GetValue(rhs).
    3. ReturnIfAbrupt(value).
    4. Let env be the running execution context’s LexicalEnvironment.
    5. Return the result of performing BindingInitialization for BindingPattern
       using value and env as the arguments.
---*/

var iterCount = 0;

for (let {a, b, ...{c, ...rest}} = {a: 1, b: 2, c: 3, d: 4, e: 5}; iterCount < 1; ) {
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


  iterCount += 1;
}

assert.sameValue(iterCount, 1, 'Iteration occurred as expected');
